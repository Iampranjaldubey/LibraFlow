package com.library.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for the token-bucket limiter, driven by a controllable clock so
 * refill behaviour is deterministic (no sleeps).
 */
class RateLimitFilterTest {

    /** Mutable clock: tests advance time explicitly. */
    static final class TestClock extends Clock {
        private Instant now = Instant.parse("2026-01-01T00:00:00Z");
        void advance(Duration d) { now = now.plus(d); }
        @Override public ZoneOffset getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(java.time.ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }

    private final TestClock clock = new TestClock();

    private RateLimitFilter filter(int capacity, int perMinute) {
        return new RateLimitFilter(true, capacity, perMinute, new ObjectMapper().findAndRegisterModules(), clock);
    }

    private MockHttpServletResponse post(RateLimitFilter f, String path, String ip) throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", path);
        req.setRemoteAddr(ip);
        MockHttpServletResponse res = new MockHttpServletResponse();
        f.doFilter(req, res, new MockFilterChain());
        return res;
    }

    @Test
    void allowsBurstUpToCapacityThenReturns429WithRetryAfter() throws Exception {
        RateLimitFilter f = filter(3, 6); // 1 token every 10s

        for (int i = 0; i < 3; i++) {
            assertThat(post(f, "/api/v1/auth/login", "1.1.1.1").getStatus()).isEqualTo(200);
        }
        MockHttpServletResponse blocked = post(f, "/api/v1/auth/login", "1.1.1.1");

        assertThat(blocked.getStatus()).isEqualTo(429);
        assertThat(blocked.getHeader("Retry-After")).isEqualTo("10");
        assertThat(blocked.getContentAsString()).contains("\"success\":false", "Too many attempts");
    }

    @Test
    void refillsOverTime() throws Exception {
        RateLimitFilter f = filter(1, 6);
        assertThat(post(f, "/api/v1/auth/login", "1.1.1.1").getStatus()).isEqualTo(200);
        assertThat(post(f, "/api/v1/auth/login", "1.1.1.1").getStatus()).isEqualTo(429);

        clock.advance(Duration.ofSeconds(10));
        assertThat(post(f, "/api/v1/auth/login", "1.1.1.1").getStatus()).isEqualTo(200);
    }

    @Test
    void bucketsAreIsolatedPerClientAndPerEndpoint() throws Exception {
        RateLimitFilter f = filter(1, 1);
        assertThat(post(f, "/api/v1/auth/login", "1.1.1.1").getStatus()).isEqualTo(200);
        assertThat(post(f, "/api/v1/auth/login", "1.1.1.1").getStatus()).isEqualTo(429);

        // Another client is unaffected...
        assertThat(post(f, "/api/v1/auth/login", "2.2.2.2").getStatus()).isEqualTo(200);
        // ...and so is another endpoint for the same client.
        assertThat(post(f, "/api/v1/auth/register", "1.1.1.1").getStatus()).isEqualTo(200);
    }

    @Test
    void ignoresNonCredentialRoutesAndNonPostMethods() throws Exception {
        RateLimitFilter f = filter(1, 1);
        for (int i = 0; i < 5; i++) {
            assertThat(post(f, "/api/v1/books", "1.1.1.1").getStatus()).isEqualTo(200);
            MockHttpServletRequest get = new MockHttpServletRequest("GET", "/api/v1/auth/login");
            MockHttpServletResponse res = new MockHttpServletResponse();
            f.doFilter(get, res, new MockFilterChain());
            assertThat(res.getStatus()).isEqualTo(200);
        }
    }

    @Test
    void disabledFilterNeverBlocks() throws Exception {
        RateLimitFilter f = new RateLimitFilter(false, 1, 1, new ObjectMapper().findAndRegisterModules(), clock);
        for (int i = 0; i < 5; i++) {
            assertThat(post(f, "/api/v1/auth/login", "1.1.1.1").getStatus()).isEqualTo(200);
        }
    }

    @Test
    void evictionDropsOnlyFullyRefilledBuckets() throws Exception {
        RateLimitFilter f = filter(2, 60); // 1 token/second
        post(f, "/api/v1/auth/login", "1.1.1.1");
        post(f, "/api/v1/auth/login", "2.2.2.2");
        post(f, "/api/v1/auth/login", "2.2.2.2");
        assertThat(f.trackedBuckets()).isEqualTo(2);

        clock.advance(Duration.ofSeconds(1)); // 1.1.1.1 back to full; 2.2.2.2 at 1/2
        f.evictIdleBuckets();
        assertThat(f.trackedBuckets()).isEqualTo(1);

        clock.advance(Duration.ofSeconds(1));
        f.evictIdleBuckets();
        assertThat(f.trackedBuckets()).isZero();
    }
}
