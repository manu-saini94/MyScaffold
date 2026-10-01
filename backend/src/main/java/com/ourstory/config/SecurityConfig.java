package com.ourstory.config;

import com.ourstory.auth.AdminAuthoritiesMapper;
import com.ourstory.auth.AdminLoginHandlers;
import com.ourstory.auth.AuthorizedClientCleaner;
import com.ourstory.auth.AuthBodyLimitFilter;
import com.ourstory.auth.ClientCleanupLogoutHandler;
import com.ourstory.auth.ViewerAuthenticationFilter;
import com.ourstory.auth.ViewerCookies;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.actuate.autoconfigure.security.servlet.EndpointRequest;
import org.springframework.boot.actuate.health.HealthEndpoint;
import org.springframework.boot.autoconfigure.security.servlet.PathRequest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.CsrfConfigurer;
import org.springframework.security.config.annotation.web.configurers.HeadersConfigurer;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestResolver;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.authentication.www.BasicAuthenticationFilter;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.session.SessionManagementFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * The single HTTP security policy. Deny by default: only the matchers below are reachable, everything else
 * is denied. CSRF is enforced on every non-safe method for every path (no exemptions).
 */
@Configuration
public class SecurityConfig {

    /** Everything the app serves is same-origin; inline script/style are not needed (dev page uses files). */
    static final String CONTENT_SECURITY_POLICY = "default-src 'self'; img-src 'self' data:; style-src 'self'; "
            + "script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
    static final String PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=()";

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http,
            ObjectProvider<ClientRegistrationRepository> clients,
            ObjectProvider<OAuth2AuthorizationRequestResolver> resolver,
            AdminAuthoritiesMapper authoritiesMapper,
            AuthorizedClientCleaner cleaner,
            OurStoryProperties props,
            ViewerCookies viewerCookies) throws Exception {
        http
            .authorizeHttpRequests(auth -> {
                auth.requestMatchers(EndpointRequest.to(HealthEndpoint.class)).permitAll();
                auth.requestMatchers(PathRequest.toStaticResources().atCommonLocations()).permitAll();
                auth.requestMatchers("/", "/index.html", "/assets/**").permitAll();
                // OAuth2 redirect, callback and Spring's login/error pages (all GET; state-checked by Spring).
                auth.requestMatchers("/oauth2/**", "/login/**", "/error").permitAll();
                if (props.devTools().enabled()) {
                    // TEMPORARY dev page (Phase 6 replaces it): static files only, no data. Dev profile only.
                    auth.requestMatchers("/dev/**").permitAll();
                }
                // Unlock endpoints are public (CSRF still applies to the POSTs; GET /question issues the token).
                auth.requestMatchers(HttpMethod.GET, "/api/auth/question", "/api/auth/status").permitAll();
                auth.requestMatchers(HttpMethod.POST, "/api/auth/unlock", "/api/auth/lock").permitAll();
                // Only the ADMIN role (verified email == ADMIN_EMAIL) may use the admin API.
                auth.requestMatchers("/api/admin/**").hasRole("ADMIN");
                // Viewers (unlock cookie) and the admin may read the experience, worlds and media.
                auth.requestMatchers("/api/experience", "/api/experience/**", "/api/worlds/**", "/api/media/**")
                        .hasAnyRole("VIEWER", "ADMIN");
                auth.anyRequest().denyAll();
            })
            // Anonymous callers get a plain 401 everywhere (no redirect to a login page, no loops).
            .exceptionHandling(ex -> ex.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
            .csrf(this::configureCsrf)
            .headers(this::configureHeaders)
            .logout(logout -> logout
                .addLogoutHandler(new ClientCleanupLogoutHandler(cleaner))
                .logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler()))
            .addFilterAfter(new CsrfCookieFilter(), BasicAuthenticationFilter.class)
            .addFilterBefore(new AuthBodyLimitFilter(), CsrfFilter.class)
            // After SessionManagementFilter so the stateless viewer login is never persisted to a session.
            .addFilterAfter(new ViewerAuthenticationFilter(viewerCookies), SessionManagementFilter.class);

        // Google login is enabled only when a client registration exists (GOOGLE_CLIENT_ID set).
        if (clients.getIfAvailable() != null) {
            http.oauth2Login(login -> {
                login.successHandler(AdminLoginHandlers.success(props.postLoginUrl(), cleaner));
                login.failureHandler(AdminLoginHandlers.failure());
                login.userInfoEndpoint(info -> info.userAuthoritiesMapper(authoritiesMapper));
                OAuth2AuthorizationRequestResolver custom = resolver.getIfAvailable();
                if (custom != null) {
                    login.authorizationEndpoint(endpoint -> endpoint.authorizationRequestResolver(custom));
                }
            });
        }
        return http.build();
    }

    /**
     * Cookie token a SPA echoes in X-XSRF-TOKEN. Spring's default matcher is used: every POST/PUT/PATCH/DELETE
     * on every path (including /logout) needs the token. There are deliberately no exemptions; the OAuth2
     * redirect and callback are GETs.
     */
    private void configureCsrf(CsrfConfigurer<HttpSecurity> csrf) {
        CookieCsrfTokenRepository repository = CookieCsrfTokenRepository.withHttpOnlyFalse();
        repository.setCookieCustomizer(cookie -> cookie.sameSite("Lax"));
        csrf.csrfTokenRepository(repository)
            // Plain (non-XOR) handler so the raw cookie value is accepted in the header.
            .csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler());
    }

    private void configureHeaders(HeadersConfigurer<HttpSecurity> headers) {
        headers.contentSecurityPolicy(csp -> csp.policyDirectives(CONTENT_SECURITY_POLICY))
            .referrerPolicy(referrer -> referrer.policy(ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN))
            .permissionsPolicyHeader(permissions -> permissions.policy(PERMISSIONS_POLICY));
    }

    /** Forces the deferred CSRF token to load so the XSRF-TOKEN cookie is issued on ordinary responses. */
    static final class CsrfCookieFilter extends OncePerRequestFilter {
        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                FilterChain chain) throws ServletException, IOException {
            CsrfToken token = (CsrfToken) request.getAttribute(CsrfToken.class.getName());
            if (token != null) {
                token.getToken();
            }
            chain.doFilter(request, response);
        }
    }
}
