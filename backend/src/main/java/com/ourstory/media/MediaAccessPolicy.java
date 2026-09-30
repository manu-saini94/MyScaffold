package com.ourstory.media;

import org.springframework.security.core.Authentication;

/**
 * EXTENSION POINT (Phase 2): decides who may fetch media bytes. Phase 1 = signed-in ADMIN only.
 * Phase 2 adds the viewer-cookie check by replacing/extending the implementation bean (and opening the
 * /api/media/** matcher in SecurityConfig); {@link MediaController} does not change.
 */
public interface MediaAccessPolicy {

    /** @return true when the current caller may read media */
    boolean isAllowed(Authentication authentication);
}
