package com.ourstory.media;

import org.springframework.security.core.Authentication;

/** Decides who may fetch media bytes. Implemented by {@link RoleBasedMediaAccessPolicy}. */
public interface MediaAccessPolicy {

    /** @return true when the caller has a role that may use the media endpoint at all (VIEWER or ADMIN) */
    boolean isAllowed(Authentication authentication);

    /**
     * @return true when the caller may read this particular media item. ADMIN: any. VIEWER: only media of a
     *         visible world (see {@link RoleBasedMediaAccessPolicy}). The controller answers 404 otherwise.
     */
    boolean canRead(Authentication authentication, String mediaId);
}
