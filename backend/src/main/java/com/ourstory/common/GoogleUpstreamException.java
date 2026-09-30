package com.ourstory.common;

import org.springframework.http.HttpStatus;

/**
 * Google (or the token refresh against Google) failed in a way that is NOT "the admin must reconnect":
 * an outage, a 5xx, a refused request. Maps to 502 with a safe message; callers may retry.
 */
public class GoogleUpstreamException extends ApiException {

    public GoogleUpstreamException(String safeDetail) {
        super(HttpStatus.BAD_GATEWAY, "google-api-error", safeDetail);
    }
}
