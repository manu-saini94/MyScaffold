package com.ourstory.media;

import org.springframework.security.core.Authentication;

/**
 * EXTENSION POINT: decides who may fetch media bytes. Currently any VIEWER or ADMIN
 * ({@link RoleBasedMediaAccessPolicy}); the content layer later adds "media belongs to a visible world".
 */
public interface MediaAccessPolicy {

    /** @return true when the current caller may read media */
    boolean isAllowed(Authentication authentication);
}
