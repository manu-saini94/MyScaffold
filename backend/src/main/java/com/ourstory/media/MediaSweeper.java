package com.ourstory.media;

import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * At startup (no import can be running yet) removes leftovers of crashed imports: {@code *.tmp} files and
 * media directories that have no DB row. Only directories older than {@link #MIN_AGE} are considered.
 */
@Component
class MediaSweeper {

    static final Duration MIN_AGE = Duration.ofHours(1);
    private static final Logger log = LoggerFactory.getLogger(MediaSweeper.class);

    private final MediaStorage storage;
    private final MediaRepository repository;

    MediaSweeper(MediaStorage storage, MediaRepository repository) {
        this.storage = storage;
        this.repository = repository;
    }

    @EventListener(ApplicationReadyEvent.class)
    void sweepOnStartup() {
        sweep(Instant.now());
    }

    MediaStorage.SweepResult sweep(Instant now) {
        try {
            MediaStorage.SweepResult result = storage.sweep(repository::existsById, now.minus(MIN_AGE));
            if (result.temporaryFiles() > 0 || result.orphanDirectories() > 0) {
                log.info("Media sweep removed {} temporary file(s) and {} orphan director(ies)",
                        result.temporaryFiles(), result.orphanDirectories());
            }
            return result;
        } catch (RuntimeException e) {
            log.warn("Media sweep failed: {}", e.getClass().getSimpleName());
            return new MediaStorage.SweepResult(0, 0);
        }
    }
}
