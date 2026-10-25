package com.library.config;

import org.springframework.beans.factory.annotation.Autowired;

import com.library.repository.UserRepository;
import com.library.security.JwtAccessDeniedHandler;
import com.library.security.JwtAuthEntryPoint;
import com.library.security.JwtAuthenticationFilter;
import jakarta.servlet.DispatcherType;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import org.springframework.beans.factory.annotation.Value;
import com.library.security.OAuth2LoginSuccessHandler;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Lazy
    private final JwtAuthenticationFilter jwtAuthFilter;
    private final JwtAuthEntryPoint       jwtAuthEntryPoint;
    private final JwtAccessDeniedHandler  jwtAccessDeniedHandler;
    private final UserRepository          userRepository;

    /** Null when no OAuth2 client registrations are configured (e.g. tests). */
    @Lazy
    @Autowired(required = false)
    private OAuth2LoginSuccessHandler oAuth2LoginSuccessHandler;

    /** Null when the OAuth2 client auto-config is excluded (e.g. tests). */
    @Autowired(required = false)
    private ClientRegistrationRepository clientRegistrationRepository;

    @Value("${app.frontend-url:http://localhost:3000}")
    private String frontendUrl;

    @Value("${app.cors.allowed-origins:}")
    private String extraAllowedOrigins;

    public SecurityConfig(@Lazy JwtAuthenticationFilter jwtAuthFilter,
                          JwtAuthEntryPoint jwtAuthEntryPoint,
                          JwtAccessDeniedHandler jwtAccessDeniedHandler,
                          UserRepository userRepository) {
        this.jwtAuthFilter          = jwtAuthFilter;
        this.jwtAuthEntryPoint      = jwtAuthEntryPoint;
        this.jwtAccessDeniedHandler = jwtAccessDeniedHandler;
        this.userRepository         = userRepository;
    }
    // ── Public endpoints ──────────────────────────────────────────────────────
    private static final String[] PUBLIC_URLS = {
            "/api/v1/auth/**",
            "/api/v1/health",
            "/actuator/health",
            "/actuator/health/**",
            "/swagger-ui/**",
            "/swagger-ui.html",
            "/api-docs/**",
            "/v3/api-docs/**"
    };

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .csrf(AbstractHttpConfigurer::disable)
            .exceptionHandling(ex -> ex
                    .authenticationEntryPoint(jwtAuthEntryPoint)
                    .accessDeniedHandler(jwtAccessDeniedHandler))
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                // Permit internal ERROR/FORWARD dispatches so error responses render
                // with their real status instead of being re-evaluated as anonymous
                // (which otherwise turns a 403/404 into a misleading 401).
                .dispatcherTypeMatchers(DispatcherType.ERROR, DispatcherType.FORWARD).permitAll()
                .requestMatchers(PUBLIC_URLS).permitAll()
                // Admin endpoints — ADMIN only
                .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                // Only ADMIN & LIBRARIAN can manage books (write)
                .requestMatchers(HttpMethod.POST, "/api/v1/books").hasAnyRole("ADMIN", "LIBRARIAN")
                .requestMatchers(HttpMethod.PUT, "/api/v1/books/**").hasAnyRole("ADMIN", "LIBRARIAN")
                .requestMatchers(HttpMethod.DELETE, "/api/v1/books/**").hasAnyRole("ADMIN", "LIBRARIAN")
                // Issue / Return — ADMIN & LIBRARIAN only
                .requestMatchers("/api/v1/issue", "/api/v1/return").hasAnyRole("ADMIN", "LIBRARIAN")
                // All transaction endpoints — ADMIN & LIBRARIAN only
                .requestMatchers("/api/v1/transactions/**").hasAnyRole("ADMIN", "LIBRARIAN")
                // GET /books is open to all authenticated users
                .requestMatchers(HttpMethod.GET, "/api/v1/books/**").authenticated()
                .anyRequest().authenticated()
            );

        // Enable OAuth2 login only when credentials are configured (i.e. the
        // ClientRegistrationRepository bean exists). In tests that exclude the
        // OAuth2 auto-configuration this bean is absent and we skip it.
        if (clientRegistrationRepository != null && oAuth2LoginSuccessHandler != null) {
            http.oauth2Login(oauth2 -> oauth2
                .successHandler(oAuth2LoginSuccessHandler)
                // Default failure URL is /login?error on the *backend*; send the user
                // back to the frontend login page with a flag it can show instead.
                .failureHandler((req, res, ex) ->
                        res.sendRedirect(frontendUrl + "/login?oauth_error=1"))
            );
        }

        http
            .authenticationProvider(authenticationProvider())
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public UserDetailsService userDetailsService() {
        return email -> userRepository.findByEmail(email)
                .orElseThrow(() -> new UsernameNotFoundException("User not found: " + email));
    }

    @Bean
    public AuthenticationProvider authenticationProvider() {
        DaoAuthenticationProvider provider = new DaoAuthenticationProvider();
        provider.setUserDetailsService(userDetailsService());
        provider.setPasswordEncoder(passwordEncoder());
        return provider;
    }

    @Bean
    public AuthenticationManager authenticationManager(
            AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();

        // The browser normally reaches the API same-origin through the Next.js
        // proxy, so CORS only matters for direct cross-origin callers. Origins are
        // configuration, not code: FRONTEND_URL is always allowed, plus any extra
        // comma-separated CORS_ALLOWED_ORIGINS. (With allowCredentials=true the
        // spec forbids wildcards, so these must be exact origins.)
        Set<String> origins = new LinkedHashSet<>();
        origins.add(stripTrailingSlash(frontendUrl));
        Arrays.stream(extraAllowedOrigins.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(SecurityConfig::stripTrailingSlash)
                .forEach(origins::add);
        configuration.setAllowedOrigins(List.copyOf(origins));
        
        // Allow all standard HTTP methods including OPTIONS for preflight
        configuration.setAllowedMethods(Arrays.asList(
            "GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD", "PATCH"
        ));
        
        // Allow all headers (important for JWT and custom headers)
        configuration.setAllowedHeaders(Arrays.asList("*"));
        
        // Expose headers that the frontend might need to read
        configuration.setExposedHeaders(Arrays.asList(
            "Authorization", 
            "Content-Type", 
            "X-Total-Count"
        ));
        
        // Allow credentials (cookies, authorization headers)
        configuration.setAllowCredentials(true);
        
        // Cache preflight response for 1 hour (3600 seconds)
        configuration.setMaxAge(3600L);
        
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    private static String stripTrailingSlash(String origin) {
        return origin.endsWith("/") ? origin.substring(0, origin.length() - 1) : origin;
    }
}
