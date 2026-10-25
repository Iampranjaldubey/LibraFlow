package com.library.config;

import com.library.repository.BookRepository;
import com.library.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "app.demo.seed=true",
        "app.demo.password=DemoPass#2026"
})
@ActiveProfiles("test")
class DemoDataSeederTest {

    @Autowired DemoDataSeeder seeder;
    @Autowired UserRepository users;
    @Autowired BookRepository books;
    @Autowired PasswordEncoder encoder;

    @Test
    void seedsOneVerifiedAccountPerRoleAndACatalogue_andIsIdempotent() {
        // The runner already executed once at startup; run it again to prove idempotency.
        seeder.run(new DefaultApplicationArguments());

        for (DemoDataSeeder.DemoUser du : DemoDataSeeder.DEMO_USERS) {
            var u = users.findByEmail(du.email()).orElseThrow();
            assertThat(u.getRole()).isEqualTo(du.role());
            assertThat(u.isEmailVerified()).isTrue();
            assertThat(u.getMemberId()).matches("LIB-\\d{5}");
            assertThat(encoder.matches("DemoPass#2026", u.getPassword())).isTrue();
        }
        // Idempotency: a second run hit the unique email/ISBN constraints without
        // throwing, and each demo record still exists exactly once.
        for (DemoDataSeeder.DemoUser du : DemoDataSeeder.DEMO_USERS) {
            assertThat(users.findAll().stream().filter(u -> u.getEmail().equals(du.email())).count())
                    .isEqualTo(1);
        }
        for (var b : DemoDataSeeder.DEMO_BOOKS) {
            var saved = books.findByIsbn(b.getIsbn()).orElseThrow();
            assertThat(saved.getAvailableCopies()).isEqualTo(saved.getTotalCopies());
        }
    }
}
