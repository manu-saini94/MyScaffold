package com.ourstory.google;

import com.ourstory.common.GoogleUpstreamException;

/** Google answered with an error or was unreachable. Carries only the status, never Google's body. */
public class GoogleApiException extends GoogleUpstreamException {

    public GoogleApiException(int upstreamStatus) {
        this(messageFor(upstreamStatus));
    }

    public GoogleApiException(String safeDetail) {
        super(safeDetail);
    }

    private static String messageFor(int upstreamStatus) {
        if (upstreamStatus == 403) {
            return "Google Photos refused the request (HTTP 403). Check that the Photos Picker API is enabled "
                    + "for the Google Cloud project.";
        }
        return upstreamStatus > 0
                ? "Google Photos rejected the request (HTTP " + upstreamStatus + ")."
                : "Google Photos could not be reached.";
    }
}
