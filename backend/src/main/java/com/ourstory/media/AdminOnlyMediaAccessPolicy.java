package com.ourstory.media;

import com.ourstory.auth.AdminGuard;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

/** Phase 1 policy: only an authenticated ADMIN. */
@Component
class AdminOnlyMediaAccessPolicy implements MediaAccessPolicy {

    @Override
    public boolean isAllowed(Authentication authentication) {
        return authentication != null && authentication.isAuthenticated()
                && authentication.getAuthorities().stream()
                        .anyMatch(a -> AdminGuard.ROLE_ADMIN.equals(a.getAuthority()));
    }
}
