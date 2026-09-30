package com.ourstory.media;

import com.ourstory.common.ApiException;
import com.ourstory.common.UlidGenerator;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/media")
class AdminMediaController {

    static final int MAX_PAGE_SIZE = 100;

    private final MediaRepository repository;
    private final MediaStorage storage;

    AdminMediaController(MediaRepository repository, MediaStorage storage) {
        this.repository = repository;
        this.storage = storage;
    }

    record MediaItem(String id, String filename, String mimeType, Integer width, Integer height,
            OffsetDateTime takenAt, String lqip, String dominantColor, OffsetDateTime importedAt) {
    }

    record MediaPage(List<MediaItem> items, int page, int size, long total) {
    }

    /** Phase 1: `unassigned` is accepted but every media item is returned (nothing can be assigned yet). */
    @GetMapping
    MediaPage list(@RequestParam(defaultValue = "false") boolean unassigned,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw ApiException.badRequest("page must be >= 0 and size between 1 and " + MAX_PAGE_SIZE);
        }
        List<MediaItem> items = repository.findPage(page, size).stream()
                .map(m -> new MediaItem(m.id(), m.filename(), m.mimeType(), m.width(), m.height(), m.takenAt(),
                        m.lqip(), m.dominantColor(), m.importedAt()))
                .toList();
        return new MediaPage(items, page, size, repository.count());
    }

    /** Removes the DB row and the files. Never calls Google. */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable String id) {
        if (!UlidGenerator.isValid(id)) {
            throw ApiException.badRequest("Invalid media id");
        }
        if (!repository.deleteById(id)) {
            throw ApiException.notFound("Media");
        }
        storage.deleteAll(id);
    }
}
