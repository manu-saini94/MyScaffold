package com.ourstory.media;

import com.ourstory.auth.AdminGuard;
import com.ourstory.auth.ViewerAuthentication;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

/**
 * Phase 2B policy: an authenticated VIEWER (valid unlock cookie) or ADMIN may read media bytes.
 *
 * <p>EXTENSION POINT (not implemented yet): once world/moment tables exist, narrow this so a viewer may only
 * read media that belongs to a visible world. That check is added later by the content layer.
 */
@Component
class RoleBasedMediaAccessPolicy implements MediaAccessPolicy {

    @Override
    public boolean isAllowed(Authentication authentication) {
        return authentication != null && authentication.isAuthenticated()
                && authentication.getAuthorities().stream().anyMatch(a ->
                        ViewerAuthentication.ROLE_VIEWER.equals(a.getAuthority())
                                || AdminGuard.ROLE_ADMIN.equals(a.getAuthority()));
    }
}
