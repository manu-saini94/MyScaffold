package com.ourstory.common;

import java.util.Map;
import org.springframework.http.HttpStatus;

/** The Google Photos token is missing, revoked or expired: the admin must go through consent again. */
public class GoogleReconnectRequiredException extends ApiException {

    public static final String AUTHORIZE_URL = "/oauth2/authorization/google-picker";

    public GoogleReconnectRequiredException() {
        super(HttpStatus.CONFLICT, "google-reconnect-required",
                "Google Photos is not connected or access has expired. Reconnect and try again.",
                Map.of("authorizeUrl", AUTHORIZE_URL));
    }
}
