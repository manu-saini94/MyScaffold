package com.ourstory.content;

import java.time.Instant;
import java.time.LocalDate;

/** A moment joined with the media columns needed to display it (never the file bytes). */
public record MomentWithMedia(String id, String worldId, String mediaId, String caption, String note,
        LocalDate happenedOn, String place, int sortOrder, boolean favourite, String mimeType, Integer width,
        Integer height, String lqip, String dominantColor, Instant takenAt) {
}
