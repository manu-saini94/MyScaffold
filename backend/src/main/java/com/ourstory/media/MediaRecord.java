package com.ourstory.media;

import java.time.OffsetDateTime;

/** A stored media item. (The unused has_video column keeps its DB default; videos are skipped in Phase 1.) */
public record MediaRecord(String id, String googleMediaId, String mimeType, Integer width, Integer height,
        OffsetDateTime takenAt, String filename, String lqip, String dominantColor, OffsetDateTime importedAt) {
}
