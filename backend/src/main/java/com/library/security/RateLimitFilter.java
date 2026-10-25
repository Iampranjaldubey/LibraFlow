package com.library.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.library.dto.response.ApiResponse;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Clock;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Per-client rate limiting for the credential endpoints (login, register,
 * password reset, verification resend) — the routes attackers hammer for
 * credential stuffing, account enumeration and email bombing.
 *
 * <p><b>Algorithm:</b> a token bucket per {@code (client IP, endpoint)}. Each
 * bucket holds up to {@code capacity} tokens and refills continuously at
 * {@code refillPerMinute}; a request spends one token or is rejected with
 * {@code 429 Too Many Requests} plus a {@code Retry-After} header. Token bucket
 * (vs. a fixed window) allows a short legitimate burst — e.g. a user mistyping a
 * password twice — without the window-boundary "double burst" problem.
 *
 * <p><b>Client identity:</b> {@code request.getRemoteAddr()}, which Spring's
 * {@code ForwardedHeaderFilter} ({@code server.forward-headers-strategy=framework})
 * resolves from {@code X-Forwarded-For} when running behind Render / the Next.js
 * proxy. That header is client-influenced, so this is a best-effort throttle, not
 * an authentication control; a WAF/edge limiter is the right layer for a hard
 * guarantee.
 *
 * <p><b>Scope / trade-off:</b> state is in-process memory, which is correct for a
 * single instance (this deployment). Scaling horizontally would need a shared
 * store (Redis + Bucket4j) so limits aren't per-replica.
 */
@Component
@Slf4j
public class RateLimitFilter extends OncePerRequestFilter {

    static final Set<String> LIMITED_PATHS = Set.of(
            "/api/v1/auth/login",
            "/api/v1/auth/register",
            "/api/v1/auth/forgot-password",
            "/api/v1/auth/reset-password",
            "/api/v1/auth/resend-verification");

    /** Hard cap on tracked buckets so a flood of spoofed IPs can't exhaust memory. */
    private static final int MAX_BUCKETS = 50_000;

    private final boolean enabled;
    private final double capacity;
    private final double refillPerMs;
    private final Clock clock;
    private final ObjectMapper objectMapper;
    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    @Autowired
    public RateLimitFilter(@Value("${app.rate-limit.enabled:true}") boolean enabled,
                           @Value("${app.rate-limit.auth.capacity:10}") int capacity,
                           @Value("${app.rate-limit.auth.refill-per-minute:10}") int refillPerMinute,
                           ObjectMapper objectMapper) {
        this(enabled, capacity, refillPerMinute, objectMapper, Clock.systemUTC());
    }

    RateLimitFilter(boolean enabled, int capacity, int refillPerMinute,
                    ObjectMapper objectMapper, Clock clock) {
        if (capacity < 1 || refillPerMinute < 1) {
            throw new IllegalArgumentException("rate-limit capacity and refill must be >= 1");
        }
        this.enabled = enabled;
        this.capacity = capacity;
        this.refillPerMs = refillPerMinute / 60_000.0;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !enabled
                || !"POST".equalsIgnoreCase(request.getMethod())
                || !LIMITED_PATHS.contains(request.getRequestURI());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        if (buckets.size() >= MAX_BUCKETS) {
            log.warn("Rate-limit bucket map hit {} entries; resetting", MAX_BUCKETS);
            buckets.clear();
        }

        String key = request.getRemoteAddr() + '|' + request.getRequestURI();
        Bucket bucket = buckets.computeIfAbsent(key, k -> new Bucket(capacity, clock.millis()));
        long retryAfterSeconds = bucket.tryConsume(clock.millis(), capacity, refillPerMs);

        if (retryAfterSeconds == 0) {
            chain.doFilter(request, response);
            return;
        }

        log.warn("Rate limit exceeded: {} {} from {}", request.getMethod(),
                request.getRequestURI(), request.getRemoteAddr());
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setHeader("Retry-After", String.valueOf(retryAfterSeconds));
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        objectMapper.writeValue(response.getOutputStream(), ApiResponse.error(
                "Too many attempts. Please wait " + retryAfterSeconds + "s and try again."));
    }

    /** Drop buckets that have fully refilled — they carry no state worth keeping. */
    @Scheduled(fixedDelayString = "${app.rate-limit.cleanup-interval-ms:300000}")
    void evictIdleBuckets() {
        long now = clock.millis();
        buckets.values().removeIf(b -> b.isFull(now, capacity, refillPerMs));
    }

    int trackedBuckets() {
        return buckets.size();
    }

    /** Lazily-refilled token bucket. Synchronized per bucket, so no global lock. */
    static final class Bucket {
        private double tokens;
        private long lastRefillMs;

        Bucket(double capacity, long nowMs) {
            this.tokens = capacity;
            this.lastRefillMs = nowMs;
        }

        /** @return 0 if a token was consumed, otherwise seconds until one is available. */
        synchronized long tryConsume(long nowMs, double capacity, double refillPerMs) {
            refill(nowMs, capacity, refillPerMs);
            if (tokens >= 1.0) {
                tokens -= 1.0;
                return 0;
            }
            double msUntilToken = (1.0 - tokens) / refillPerMs;
            return Math.max(1, (long) Math.ceil(msUntilToken / 1000.0));
        }

        synchronized boolean isFull(long nowMs, double capacity, double refillPerMs) {
            refill(nowMs, capacity, refillPerMs);
            return tokens >= capacity;
        }

        private void refill(long nowMs, double capacity, double refillPerMs) {
            long elapsed = Math.max(0, nowMs - lastRefillMs);
            tokens = Math.min(capacity, tokens + elapsed * refillPerMs);
            lastRefillMs = nowMs;
        }
    }
}
