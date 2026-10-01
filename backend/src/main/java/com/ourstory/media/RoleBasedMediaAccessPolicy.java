package com.ourstory.media;

import com.ourstory.auth.AdminGuard;
import com.ourstory.auth.ViewerAuthentication;
import java.time.Clock;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

/**
 * ADMIN may read any media. A VIEWER may read a media file only when it is referenced by a moment of, or is
 * the cover of, a PUBLISHED world that is NOT locked right now. Listing a media id in the hero setting grants
 * nothing by itself. The clock is read on every call (no caching), so a world opening or closing by time is
 * honoured immediately.
 */
@Component
class RoleBasedMediaAccessPolicy implements MediaAccessPolicy {

    private final MediaRepository media;
    private final Clock clock;

    RoleBasedMediaAccessPolicy(MediaRepository media, Clock clock) {
        this.media = media;
        this.clock = clock;
    }

    @Override
    public boolean isAllowed(Authentication authentication) {
        return hasAuthority(authentication, ViewerAuthentication.ROLE_VIEWER)
                || hasAuthority(authentication, AdminGuard.ROLE_ADMIN);
    }

    @Override
    public boolean canRead(Authentication authentication, String mediaId) {
        if (hasAuthority(authentication, AdminGuard.ROLE_ADMIN)) {
            return true;
        }
        return hasAuthority(authentication, ViewerAuthentication.ROLE_VIEWER)
                && media.isVisibleToViewer(mediaId, clock.instant());
    }

    private static boolean hasAuthority(Authentication authentication, String role) {
        return authentication != null && authentication.isAuthenticated()
                && authentication.getAuthorities().stream().anyMatch(a -> role.equals(a.getAuthority()));
    }
}
