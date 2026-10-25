package com.library.service.impl;

import com.library.entity.User;
import com.library.service.EmailService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;

@Service
@RequiredArgsConstructor
@Slf4j
public class EmailServiceImpl implements EmailService {

    private final JavaMailSender mailSender;

    @Value("${app.mail.from:noreply@libraflow.dev}")
    private String fromEmail;

    @Value("${app.frontend-url:http://localhost:3000}")
    private String frontendUrl;

    @Override
    @Async
    public void sendVerificationEmail(User user, String token) {
        String verifyUrl = frontendUrl + "/verify-email?token=" + token;
        String subject = "Verify your email — LibraFlow";
        String body = """
                <html>
                <body style="font-family: 'Segoe UI', Arial, sans-serif; padding: 20px;">
                  <div style="max-width: 500px; margin: 0 auto; background: #f8f9fa; border-radius: 12px; padding: 32px;">
                    <h2 style="color: #1a1a2e; margin-bottom: 16px;">Welcome to LibraFlow!</h2>
                    <p style="color: #555; line-height: 1.6;">
                      Hi <strong>%s</strong>, thanks for registering. Please verify your email address
                      by clicking the button below:
                    </p>
                    <div style="text-align: center; margin: 24px 0;">
                      <a href="%s"
                         style="display: inline-block; background: #6366f1; color: white;
                                padding: 12px 32px; border-radius: 8px; text-decoration: none;
                                font-weight: 600;">
                        Verify Email
                      </a>
                    </div>
                    <p style="color: #888; font-size: 13px;">
                      This link expires in 24 hours. If you didn't create an account, ignore this email.
                    </p>
                  </div>
                </body>
                </html>
                """.formatted(user.getName(), verifyUrl);

        sendHtmlEmail(user.getEmail(), subject, body);
    }

    @Override
    @Async
    public void sendPasswordResetEmail(User user, String token) {
        String resetUrl = frontendUrl + "/reset-password?token=" + token;
        String subject = "Reset your password — LibraFlow";
        String body = """
                <html>
                <body style="font-family: 'Segoe UI', Arial, sans-serif; padding: 20px;">
                  <div style="max-width: 500px; margin: 0 auto; background: #f8f9fa; border-radius: 12px; padding: 32px;">
                    <h2 style="color: #1a1a2e; margin-bottom: 16px;">Password Reset</h2>
                    <p style="color: #555; line-height: 1.6;">
                      Hi <strong>%s</strong>, we received a request to reset your password.
                      Click the button below to set a new password:
                    </p>
                    <div style="text-align: center; margin: 24px 0;">
                      <a href="%s"
                         style="display: inline-block; background: #6366f1; color: white;
                                padding: 12px 32px; border-radius: 8px; text-decoration: none;
                                font-weight: 600;">
                        Reset Password
                      </a>
                    </div>
                    <p style="color: #888; font-size: 13px;">
                      This link expires in 1 hour. If you didn't request this, ignore this email.
                    </p>
                  </div>
                </body>
                </html>
                """.formatted(user.getName(), resetUrl);

        sendHtmlEmail(user.getEmail(), subject, body);
    }

    // ── Helper ────────────────────────────────────────────────────────────────
    private void sendHtmlEmail(String to, String subject, String htmlBody) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(fromEmail);
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(htmlBody, true);
            mailSender.send(message);
            log.info("Email sent to {} — subject: {}", to, subject);
        } catch (MessagingException e) {
            log.error("Failed to send email to {}: {}", to, e.getMessage(), e);
            // Don't throw — email failure shouldn't block the main flow
        }
    }
}
