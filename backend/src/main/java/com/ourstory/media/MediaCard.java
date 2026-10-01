package com.ourstory.media;

/** The columns of a media row needed to paint a placeholder and lay it out (no file info). */
public record MediaCard(String id, Integer width, Integer height, String lqip, String dominantColor) {
}
