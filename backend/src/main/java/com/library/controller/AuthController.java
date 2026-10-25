package com.library.controller;

import com.library.dto.request.*;
import com.library.dto.response.ApiResponse;
import com.library.dto.response.AuthResponse;
import com.library.exception.TokenRefreshException;
import com.library.security.RefreshTokenCookieFactory;
import com.library.service.AuthService;
import com.library.service.EmailVerificationService;
import com.library.service.PasswordResetService;
import com.library.service.RefreshTokenService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
@Tag(name = "Authentication", description = "Register, login, and account management endpoints")
public class AuthController {

    private final AuthService               authService;
    private final RefreshTokenService       refreshTokenService;
    private final PasswordResetService      passwordResetService;
    private final EmailVerificationService  emailVerificationService;
    private final RefreshTokenCookieFactory refreshCookieFactory;
    /** Present only when Google credentials are configured (see GoogleOAuth2Config). */
    private final ObjectProvider<ClientRegistrationRepository> clientRegistrations;

    @GetMapping("/providers")
    @Operation(summary = "Available login providers",
               description = "Tells the UI which sign-in options are enabled on this deployment, "
                       + "so it can hide the Google button when OAuth isn't configured.")
    public ResponseEntity<ApiResponse<Map<String, Boolean>>> providers() {
        boolean google = clientRegistrations.getIfAvailable() != null;
        return ResponseEntity.ok(ApiResponse.success("Login providers",
                Map.of("password", true, "google", google)));
    }

    @PostMapping("/register")
    @Operation(summary = "Register a new user",
               description = "Creates a new user account, sends a verification email, and returns a JWT token.")
    public ResponseEntity<ApiResponse<AuthResponse>> register(
            @Valid @RequestBody RegisterRequest request) {

        AuthResponse response = authService.register(request);
        ResponseCookie cookie = moveRefreshTokenToCookie(response);
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .body(ApiResponse.success(
                        "Registration successful. Please check your email to verify your account.", response));
    }

    @PostMapping("/login")
    @Operation(summary = "Authenticate user",
               description = "Validates credentials and returns a JWT token. Requires a verified email.")
    public ResponseEntity<ApiResponse<AuthResponse>> login(
            @Valid @RequestBody LoginRequest request) {

        AuthResponse response = authService.login(request);
        ResponseCookie cookie = moveRefreshTokenToCookie(response);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .body(ApiResponse.success("Login successful", response));
    }

    @PostMapping("/refresh")
    @Operation(summary = "Refresh access token",
               description = "Reads the HttpOnly refresh-token cookie, rotates it, and returns a new access token.")
    public ResponseEntity<ApiResponse<AuthResponse>> refreshToken(
            @CookieValue(name = RefreshTokenCookieFactory.COOKIE_NAME, required = false) String cookieToken) {

        if (cookieToken == null || cookieToken.isBlank()) {
            throw new TokenRefreshException("No refresh token cookie present.");
        }

        RefreshTokenService.RotatedTokens rotated = refreshTokenService.rotate(cookieToken);
        ResponseCookie cookie = refreshCookieFactory.create(rotated.refreshTokenValue());
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .body(ApiResponse.success("Token refreshed successfully", rotated.authResponse()));
    }

    @PostMapping("/logout")
    @Operation(summary = "Log out",
               description = "Revokes the current refresh token and clears the HttpOnly cookie.")
    public ResponseEntity<ApiResponse<Void>> logout(
            @CookieValue(name = RefreshTokenCookieFactory.COOKIE_NAME, required = false) String cookieToken) {

        refreshTokenService.revokeByToken(cookieToken);
        ResponseCookie cleared = refreshCookieFactory.clearing();
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cleared.toString())
                .body(ApiResponse.success("Logged out successfully", null));
    }

    /**
     * Moves the refresh token out of the JSON body and into an HttpOnly cookie:
     * the body field is nulled (so it never reaches localStorage / JS), and the
     * returned cookie is what actually carries the token to the browser.
     */
    private ResponseCookie moveRefreshTokenToCookie(AuthResponse response) {
        ResponseCookie cookie = refreshCookieFactory.create(response.getRefreshToken());
        response.setRefreshToken(null);
        return cookie;
    }

    // ── Password Reset ────────────────────────────────────────────────────────

    @PostMapping("/forgot-password")
    @Operation(summary = "Request password reset",
               description = "Sends a password reset email if the account exists. Always returns 200 to prevent email enumeration.")
    public ResponseEntity<ApiResponse<Void>> forgotPassword(
            @Valid @RequestBody ForgotPasswordRequest request) {

        passwordResetService.requestReset(request.getEmail());
        return ResponseEntity.ok(
                ApiResponse.success("If an account exists with this email, a reset link has been sent.", null));
    }

    @PostMapping("/reset-password")
    @Operation(summary = "Reset password",
               description = "Validates the reset token and sets a new password.")
    public ResponseEntity<ApiResponse<Void>> resetPassword(
            @Valid @RequestBody ResetPasswordRequest request) {

        passwordResetService.resetPassword(request.getToken(), request.getNewPassword());
        return ResponseEntity.ok(
                ApiResponse.success("Password reset successful. You can now log in with your new password.", null));
    }

    // ── Email Verification ────────────────────────────────────────────────────

    @GetMapping("/verify-email")
    @Operation(summary = "Verify email address",
               description = "Verifies the user's email using the token from the verification email.")
    public ResponseEntity<ApiResponse<Void>> verifyEmail(
            @RequestParam String token) {

        emailVerificationService.verifyEmail(token);
        return ResponseEntity.ok(
                ApiResponse.success("Email verified successfully. You can now log in.", null));
    }

    @PostMapping("/resend-verification")
    @Operation(summary = "Resend verification email",
               description = "Sends a new verification email to the given address.")
    public ResponseEntity<ApiResponse<Void>> resendVerification(
            @Valid @RequestBody ResendVerificationRequest request) {

        emailVerificationService.resendVerification(request.getEmail());
        return ResponseEntity.ok(
                ApiResponse.success("Verification email sent. Please check your inbox.", null));
    }
}

