package com.library.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Google login must be optional: the app boots without credentials (the old
 * config crashed with "Client id must not be empty"), reports it disabled, and
 * enables it — including the /oauth2/authorization redirect — once configured.
 */
class OAuthProvidersTest {

    private static JsonNode providers(TestRestTemplate rest, ObjectMapper om) throws Exception {
        ResponseEntity<String> resp = rest.getForEntity("/api/v1/auth/providers", String.class);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        return om.readTree(resp.getBody()).path("data");
    }

    @Nested
    @SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
    @ActiveProfiles("test")
    class WithoutGoogleCredentials {
        @Autowired TestRestTemplate rest;
        @Autowired ObjectMapper om;

        @Test
        void bootsAndReportsGoogleDisabled() throws Exception {
            JsonNode data = providers(rest, om);
            assertThat(data.path("password").asBoolean()).isTrue();
            assertThat(data.path("google").asBoolean()).isFalse();
        }
    }

    @Nested
    @SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
            properties = {
                    "app.oauth2.google.client-id=test-client-id",
                    "app.oauth2.google.client-secret=test-secret",
                    "app.oauth2.google.redirect-uri=https://app.example.com/login/oauth2/code/google"
            })
    @ActiveProfiles("test")
    class WithGoogleCredentials {
        @Autowired TestRestTemplate rest;
        @Autowired ObjectMapper om;

        @Test
        void reportsGoogleEnabled() throws Exception {
            assertThat(providers(rest, om).path("google").asBoolean()).isTrue();
        }

        @Test
        void authorizationEndpointRedirectsToGoogleWithConfiguredRedirectUri() {
            ResponseEntity<String> resp = rest.getForEntity("/oauth2/authorization/google", String.class);
            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FOUND);
            String location = resp.getHeaders().getLocation().toString();
            assertThat(location).startsWith("https://accounts.google.com/o/oauth2/v2/auth");
            assertThat(location).contains("client_id=test-client-id");
            assertThat(location).contains("redirect_uri=https://app.example.com/login/oauth2/code/google");
        }
    }
}
