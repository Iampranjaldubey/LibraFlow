package com.library.integration;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Proves the limiter is actually wired into the real servlet filter chain
 * (not just correct in isolation): after CAPACITY login attempts, the next one
 * is rejected with 429 + Retry-After before reaching the auth service.
 *
 * <p>Uses the JDK HttpClient on purpose: TestRestTemplate's Apache HttpClient 5
 * transparently retries 429s after sleeping for Retry-After, which would mask
 * the very response this test asserts on.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "app.rate-limit.enabled=true",
                "app.rate-limit.auth.capacity=3",
                "app.rate-limit.auth.refill-per-minute=1"
        })
@ActiveProfiles("test")
class RateLimitIntegrationTest {

    @LocalServerPort int port;
    private final HttpClient http = HttpClient.newHttpClient();

    private HttpResponse<String> login() throws Exception {
        HttpRequest req = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/v1/auth/login"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(
                        "{\"email\":\"nobody@example.com\",\"password\":\"wrong-pass\"}"))
                .build();
        return http.send(req, HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void loginIsThrottledAfterCapacityIsSpent() throws Exception {
        for (int i = 0; i < 3; i++) {
            assertThat(login().statusCode()).isNotEqualTo(429);
        }
        HttpResponse<String> blocked = login();
        assertThat(blocked.statusCode()).isEqualTo(429);
        assertThat(blocked.headers().firstValue("Retry-After")).hasValue("60");
        assertThat(blocked.body()).contains("Too many attempts");
    }
}
