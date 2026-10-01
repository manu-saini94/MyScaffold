package com.ourstory.auth;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Turns a valid viewer cookie into a stateless ROLE_VIEWER authentication for this request only. It never
 * touches the HttpSession, never overrides a real (admin) login, and ignores bad cookies silently.
 */
public final class ViewerAuthenticationFilter extends OncePerRequestFilter {

    private final ViewerCookies cookies;

    public ViewerAuthenticationFilter(ViewerCookies cookies) {
        this.cookies = cookies;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException {
        Authentication current = SecurityContextHolder.getContext().getAuthentication();
        boolean unauthenticated = current == null || current instanceof AnonymousAuthenticationToken;
        if (unauthenticated && cookies.hasValidCookie(request)) {
            SecurityContext context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(new ViewerAuthentication());
            SecurityContextHolder.setContext(context);
        }
        chain.doFilter(request, response);
    }
}
