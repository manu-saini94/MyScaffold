package com.ourstory.content;

import java.time.Instant;

/** A themed collection of moments. {@code unlockAt} null means always open. */
public record World(String id, String slug, String title, String subtitle, String tagline, WorldLayout layout,
        String coverMediaId, String themeAccent, int sortOrder, Instant unlockAt, String introText,
        String outroText, String musicUrl, boolean published, Instant createdAt, Instant updatedAt) {
}
