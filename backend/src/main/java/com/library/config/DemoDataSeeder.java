package com.library.config;

import com.library.entity.AuthProvider;
import com.library.entity.Book;
import com.library.entity.Role;
import com.library.entity.User;
import com.library.repository.BookRepository;
import com.library.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Seeds a ready-to-explore demo dataset: one account per role plus a small
 * catalogue. OFF by default — enable with {@code APP_DEMO_SEED=true} on a demo
 * deployment so reviewers can sign in immediately.
 *
 * <p>Idempotent: users are created only if their email is absent and books only
 * if their ISBN is absent, so restarts never duplicate data or overwrite changes.
 * The shared password comes from {@code APP_DEMO_PASSWORD}; never enable this on
 * an instance holding real user data.
 */
@Component
@ConditionalOnProperty(name = "app.demo.seed", havingValue = "true")
@RequiredArgsConstructor
@Slf4j
public class DemoDataSeeder implements ApplicationRunner {

    private final UserRepository userRepository;
    private final BookRepository bookRepository;
    private final PasswordEncoder passwordEncoder;

    @Value("${app.demo.password}")
    private String demoPassword;

    record DemoUser(String name, String email, Role role) {}

    static final List<DemoUser> DEMO_USERS = List.of(
            new DemoUser("Demo Admin", "admin@libraflow.dev", Role.ADMIN),
            new DemoUser("Demo Librarian", "librarian@libraflow.dev", Role.LIBRARIAN),
            new DemoUser("Demo Member", "member@libraflow.dev", Role.USER));

    static final List<Book> DEMO_BOOKS = List.of(
            book("Clean Code", "Robert C. Martin", "9780132350884", "Software Engineering", 3),
            book("Designing Data-Intensive Applications", "Martin Kleppmann", "9781449373320", "Databases", 2),
            book("Introduction to Algorithms", "Cormen, Leiserson, Rivest, Stein", "9780262046305", "Algorithms", 4),
            book("The Pragmatic Programmer", "David Thomas, Andrew Hunt", "9780135957059", "Software Engineering", 2),
            book("Operating System Concepts", "Silberschatz, Galvin, Gagne", "9781119800361", "Operating Systems", 3),
            book("Computer Networking: A Top-Down Approach", "Kurose, Ross", "9780136681557", "Networking", 2),
            book("Effective Java", "Joshua Bloch", "9780134685991", "Programming Languages", 2),
            book("Java Concurrency in Practice", "Brian Goetz", "9780321349606", "Programming Languages", 1),
            book("Database System Concepts", "Silberschatz, Korth, Sudarshan", "9780078022159", "Databases", 3),
            book("Cracking the Coding Interview", "Gayle Laakmann McDowell", "9780984782857", "Interview Prep", 5),
            book("Refactoring", "Martin Fowler", "9780134757599", "Software Engineering", 1),
            book("System Design Interview", "Alex Xu", "9798664653403", "Interview Prep", 2));

    private static Book book(String title, String author, String isbn, String category, int copies) {
        return Book.builder().title(title).author(author).isbn(isbn).category(category)
                .totalCopies(copies).availableCopies(copies).build();
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (demoPassword == null || demoPassword.length() < 8) {
            throw new IllegalStateException(
                    "app.demo.seed=true requires APP_DEMO_PASSWORD with at least 8 characters");
        }

        int users = 0;
        for (DemoUser du : DEMO_USERS) {
            if (userRepository.existsByEmail(du.email())) continue;
            User saved = userRepository.save(User.builder()
                    .name(du.name())
                    .email(du.email())
                    .password(passwordEncoder.encode(demoPassword))
                    .role(du.role())
                    .provider(AuthProvider.LOCAL)
                    .emailVerified(true)
                    .active(true)
                    // Unique placeholder; replaced by the id-based member ID below.
                    .memberId("DEMO-" + du.role().name())
                    .build());
            saved.setMemberId(String.format("LIB-%05d", saved.getId()));
            users++;
        }

        int books = 0;
        for (Book template : DEMO_BOOKS) {
            if (bookRepository.existsByIsbn(template.getIsbn())) continue;
            bookRepository.save(Book.builder()
                    .title(template.getTitle()).author(template.getAuthor())
                    .isbn(template.getIsbn()).category(template.getCategory())
                    .totalCopies(template.getTotalCopies())
                    .availableCopies(template.getAvailableCopies())
                    .build());
            books++;
        }

        log.info("Demo seed complete: {} user(s) and {} book(s) created", users, books);
    }
}
