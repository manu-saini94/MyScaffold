package com.ourstory.google;

/** A media download failed. The reason is a short code that is safe to store and show (no URLs/tokens). */
public class DownloadException extends RuntimeException {

    private final String reason;
    private final boolean unauthorized;

    public DownloadException(String reason, boolean unauthorized) {
        super(reason);
        this.reason = reason;
        this.unauthorized = unauthorized;
    }

    public String reason() {
        return reason;
    }

    /** True for HTTP 401: the access token is no longer valid, so retrying items is pointless. */
    public boolean isUnauthorized() {
        return unauthorized;
    }
}
