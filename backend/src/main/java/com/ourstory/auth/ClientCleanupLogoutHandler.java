package com.ourstory.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.authentication.logout.LogoutHandler;

/** On logout, drops the stored Google tokens of the principal (they live in memory, keyed by user). */
public class ClientCleanupLogoutHandler implements LogoutHandler {

    private final AuthorizedClientCleaner cleaner;

    public ClientCleanupLogoutHandler(AuthorizedClientCleaner cleaner) {
        this.cleaner = cleaner;
    }

    @Override
    public void logout(HttpServletRequest request, HttpServletResponse response, Authentication authentication) {
        cleaner.removeFor(authentication);
    }
}
