package com.ourstory.media;

import java.util.Optional;

/** Whitelist of servable sizes. Anything else is rejected before touching the file system. */
public enum MediaSize {
    THUMB("thumb"),
    MEDIUM("medium"),
    FULL("full");

    private final String path;

    MediaSize(String path) {
        this.path = path;
    }

    public String path() {
        return path;
    }

    public static Optional<MediaSize> fromPath(String value) {
        for (MediaSize size : values()) {
            if (size.path.equals(value)) {
                return Optional.of(size);
            }
        }
        return Optional.empty();
    }
}
