package com.library.security;

import com.library.entity.AuthProvider;
import com.library.entity.Role;
import com.library.entity.User;
import com.library.repository.UserRepository;
import com.library.service.RefreshTokenService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.UUID;

/**
 * Completes a Google login.
 *
 * <p>Security note: earlier versions redirected to
 * {@code /oauth-callback?token=<JWT>&user=<json>}, which leaks the access token
 * into browser history, server/proxy access logs and the {@code Referer} header.
 * Now the handler only sets the HttpOnly refresh-token cookie and redirects to a
 * bare {@code /oauth-callback}; that page calls {@code POST /api/v1/auth/refresh}
 * (same-origin via the Next.js proxy) to obtain the access token. No credential
 * ever appears in a URL.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class OAuth2LoginSuccessHandler extends SimpleUrlAuthenticationSuccessHandler {

    private final UserRepository userRepository;
    private final RefreshTokenService refreshTokenService;
    private final RefreshTokenCookieFactory refreshCookieFactory;
    private final PasswordEncoder passwordEncoder;

    // NOTE: must match the key used everywhere else (app.frontend-url). The old
    // handler read "app.frontend.url", which is never set, so production always
    // redirected to http://localhost:3000.
    @Value("${app.frontend-url:http://localhost:3000}")
    private String frontendUrl;

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response,
                                        Authentication authentication) throws IOException {

        OAuth2User oAuth2User = (OAuth2User) authentication.getPrincipal();
        String email = oAuth2User.getAttribute("email");
        String name = oAuth2User.getAttribute("name");

        if (email == null || email.isBlank()) {
            log.warn("OAuth2 login rejected: provider returned no email");
            getRedirectStrategy().sendRedirect(request, response, frontendUrl + "/login?oauth_error=1");
            return;
        }

        User user = userRepository.findByEmail(email).orElseGet(() -> registerOAuthUser(email, name));

        if (!user.isActive()) {
            log.warn("OAuth2 login rejected for deactivated account {}", email);
            getRedirectStrategy().sendRedirect(request, response, frontendUrl + "/login?oauth_error=inactive");
            return;
        }

        String refreshToken = refreshTokenService.createRefreshToken(user).getToken();
        ResponseCookie cookie = refreshCookieFactory.create(refreshToken);
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());

        // The OAuth handshake needed a server session to hold the authorization
        // request (state/nonce). It's done now — drop it so the API stays stateless.
        if (request.getSession(false) != null) {
            request.getSession(false).invalidate();
        }

        log.info("OAuth2 login successful for {}", email);
        getRedirectStrategy().sendRedirect(request, response, frontendUrl + "/oauth-callback");
    }

    private User registerOAuthUser(String email, String name) {
        log.info("Registering new user from OAuth2: {}", email);
        Long maxId = userRepository.findMaxId();
        long nextNum = (maxId != null ? maxId : 0) + 1;

        User newUser = User.builder()
                .email(email)
                .name(name != null ? name : "Unknown")
                // Unusable random password: OAuth users authenticate via Google only.
                .password(passwordEncoder.encode(UUID.randomUUID().toString()))
                .role(Role.USER)
                .provider(AuthProvider.GOOGLE)
                .emailVerified(true)
                .active(true)
                .memberId(String.format("LIB-%05d", nextNum))
                .build();
        return userRepository.save(newUser);
    }
}
