package com.ourstory.media;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Optional;
import java.util.function.Predicate;

/** Where image bytes live. The only implementation today is the local file system. */
public interface MediaStorage {

    /** A stored file ready to be streamed. */
    record StoredFile(Path path, long length, String contentType) {
    }

    /** What a startup sweep removed. */
    record SweepResult(int temporaryFiles, int orphanDirectories) {
    }

    /**
     * Atomically stores the bytes (never leaves a partial file visible).
     *
     * @throws DiskFullException when free space is below the configured floor (nothing is written)
     */
    void write(String mediaId, MediaSize size, byte[] data) throws IOException;

    /** Empty when the id is malformed or the file does not exist. */
    Optional<StoredFile> find(String mediaId, MediaSize size);

    /** Removes every file of a media item; idempotent. */
    void deleteAll(String mediaId);

    /**
     * Removes leftover {@code *.tmp} files and orphan media directories: only directories whose name is a
     * valid id, that are older than {@code olderThan} and for which {@code hasRow} says there is no DB row.
     */
    SweepResult sweep(Predicate<String> hasRow, Instant olderThan);
}
