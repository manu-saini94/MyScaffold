package com.ourstory.media;

import java.io.IOException;

/** The data volume has less usable space than the configured floor; nothing was written. */
public class DiskFullException extends IOException {

    public DiskFullException() {
        super("Not enough free disk space");
    }
}
