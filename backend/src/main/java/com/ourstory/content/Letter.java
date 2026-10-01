package com.ourstory.content;

import java.time.Instant;

/**
 * A letter. {@code body} is RAW markdown stored as-is: the frontend renders it safely, the server must never
 * render it as HTML. {@code worldId} null means not tied to a world.
 */
public record Letter(String id, String worldId, String title, String body, RevealTrigger revealTrigger,
        int sortOrder, Instant createdAt) {
}
