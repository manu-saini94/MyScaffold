package com.ourstory.auth;

import com.ourstory.common.GoogleReconnectRequiredException;
import com.ourstory.common.GoogleUpstreamException;
import org.springframework.security.core.Authentication;

/** Supplies a valid Google Photos Picker access token for the signed-in admin (refreshing when needed). */
public interface PickerTokenProvider {

    /**
     * @throws GoogleReconnectRequiredException when no usable token exists (never connected, revoked,
     *         or refresh failed with invalid_grant)
     * @throws GoogleUpstreamException when the refresh failed for a transient reason (retry later)
     */
    String accessToken(Authentication principal);

    /** A transient refresh failure still counts as connected: the user must not be sent through consent. */
    default boolean isConnected(Authentication principal) {
        try {
            accessToken(principal);
            return true;
        } catch (GoogleReconnectRequiredException e) {
            return false;
        } catch (GoogleUpstreamException e) {
            return true;
        }
    }
}
