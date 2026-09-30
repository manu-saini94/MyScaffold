package com.ourstory.auth;

import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.DefaultRedirectStrategy;
import org.springframework.security.web.authentication.AuthenticationFailureHandler;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;

/**
 * OAuth2 login outcomes. Only the admin keeps a session: any other Google account that completes login is
 * signed out again on the spot (session invalidated, stored Google tokens removed) and gets a small static
 * 403 page, so a stranger never lingers with a live session or refresh token.
 */
public final class AdminLoginHandlers {

    private static final Logger log = LoggerFactory.getLogger(AdminLoginHandlers.class);

    private AdminLoginHandlers() {
    }

    /** Admin: redirect to the post-login page. Anyone else: purge and answer 403. */
    public static AuthenticationSuccessHandler success(String postLoginUrl, AuthorizedClientCleaner cleaner) {
        DefaultRedirectStrategy redirect = new DefaultRedirectStrategy();
        return (request, response, authentication) -> {
            if (isAdmin(authentication)) {
                redirect.sendRedirect(request, response, postLoginUrl);
                return;
            }
            log.info("Non-admin Google login rejected");
            cleaner.removeFor(authentication);
            HttpSession session = request.getSession(false);
            if (session != null) {
                session.invalidate();
            }
            SecurityContextHolder.clearContext();
            writePage(response, HttpServletResponse.SC_FORBIDDEN, "Not authorised",
                    "This Google account is not authorised to use Our Story.");
        };
    }

    /** Denied consent or a failed code exchange: no session was created; show a static 401 page. */
    public static AuthenticationFailureHandler failure() {
        return (request, response, exception) -> {
            log.info("Google login failed: {}", exception.getClass().getSimpleName());
            writePage(response, HttpServletResponse.SC_UNAUTHORIZED, "Sign-in failed",
                    "Google sign-in did not complete. Go back and try again.");
        };
    }

    private static boolean isAdmin(Authentication authentication) {
        return authentication != null && authentication.getAuthorities().stream()
                .anyMatch(a -> AdminGuard.ROLE_ADMIN.equals(a.getAuthority()));
    }

    /** Static markup only (no inline script or style, which the CSP would block anyway). */
    private static void writePage(HttpServletResponse response, int status, String title, String message)
            throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.TEXT_HTML_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        response.getWriter().write("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>"
                + title + "</title></head><body><main><h1>" + title + "</h1><p>" + message
                + "</p></main></body></html>");
    }
}
