package com.library.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.oauth2.client.CommonOAuth2Provider;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;

/**
 * Registers the Google OAuth2 client ONLY when credentials are configured.
 *
 * <p>Previously the registration lived in {@code application.properties} as
 * {@code spring.security.oauth2.client.registration.google.client-id=${GOOGLE_CLIENT_ID:}}.
 * With no credentials set, Spring Boot's validation failed ("Client id must not be
 * empty") and the app refused to boot — on a fresh {@code docker compose up} and on
 * any deploy that didn't use Google login. Building the registration here, behind a
 * condition, makes Google login a genuinely optional feature: when this bean is
 * absent, {@link SecurityConfig} skips {@code oauth2Login()} and
 * {@code GET /api/v1/auth/providers} reports Google as disabled so the UI hides it.
 */
@Configuration
@ConditionalOnExpression("!'${app.oauth2.google.client-id:}'.isBlank()")
public class GoogleOAuth2Config {

    @Bean
    public ClientRegistrationRepository clientRegistrationRepository(
            @Value("${app.oauth2.google.client-id}") String clientId,
            @Value("${app.oauth2.google.client-secret}") String clientSecret,
            // Behind the Next.js same-origin proxy the callback must land on the
            // FRONTEND origin (e.g. https://app.vercel.app/login/oauth2/code/google),
            // so production sets this explicitly. {baseUrl} works for direct access.
            @Value("${app.oauth2.google.redirect-uri:{baseUrl}/login/oauth2/code/{registrationId}}")
            String redirectUri) {

        ClientRegistration google = CommonOAuth2Provider.GOOGLE.getBuilder("google")
                .clientId(clientId)
                .clientSecret(clientSecret)
                .redirectUri(redirectUri)
                .scope("profile", "email")
                .build();
        return new InMemoryClientRegistrationRepository(google);
    }
}
