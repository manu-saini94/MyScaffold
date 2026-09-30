package com.ourstory.google;

/** Sizes requested from Google (`=w{n}-h{n}`: fits inside an n x n box, aspect ratio preserved). */
public enum ImageVariant {
    LQIP(32),
    THUMB(480),
    MEDIUM(1280),
    FULL(2560);

    private final int box;

    ImageVariant(int box) {
        this.box = box;
    }

    public String suffix() {
        return "=w" + box + "-h" + box;
    }
}
