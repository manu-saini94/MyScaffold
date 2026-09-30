package com.ourstory.media;

import com.ourstory.common.ApiException;
import com.ourstory.media.MediaStorage.StoredFile;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.Optional;
import org.springframework.core.io.PathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/** GET /api/media/{id}/{thumb|medium|full}: immutable, strongly-cached image bytes. */
@RestController
class MediaController {

    private static final CacheControl CACHE = CacheControl.maxAge(java.time.Duration.ofDays(365))
            .cachePrivate().immutable();

    private final MediaAccessPolicy policy;
    private final MediaRepository repository;
    private final MediaStorage storage;

    MediaController(MediaAccessPolicy policy, MediaRepository repository, MediaStorage storage) {
        this.policy = policy;
        this.repository = repository;
        this.storage = storage;
    }

    @GetMapping("/api/media/{id}/{size}")
    ResponseEntity<Resource> get(@PathVariable String id, @PathVariable String size,
            @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch,
            Authentication authentication) {
        if (!policy.isAllowed(authentication)) {
            throw new AccessDeniedException("Media access denied");
        }
        Optional<MediaSize> mediaSize = MediaSize.fromPath(size);
        Optional<OffsetDateTime> importedAt = mediaSize.isEmpty() ? Optional.empty() : repository.findImportedAt(id);
        Optional<StoredFile> file = importedAt.isEmpty() ? Optional.empty() : storage.find(id, mediaSize.get());
        if (file.isEmpty()) {
            throw ApiException.notFound("Media");
        }
        String etag = etag(id, mediaSize.get(), importedAt.get());
        if (matches(ifNoneMatch, etag)) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED).eTag(etag).cacheControl(CACHE).build();
        }
        return ResponseEntity.ok()
                .eTag(etag)
                .cacheControl(CACHE)
                .contentType(MediaType.parseMediaType(file.get().contentType()))
                .contentLength(file.get().length())
                .body(new PathResource(file.get().path()));
    }

    /** Strong validator derived from id + size + imported_at (files are immutable once imported). */
    static String etag(String id, MediaSize size, OffsetDateTime importedAt) {
        String source = id + "|" + size.path() + "|" + importedAt.toInstant().toEpochMilli();
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(source.getBytes(StandardCharsets.UTF_8));
            return "\"" + HexFormat.of().formatHex(Arrays.copyOf(digest, 16)) + "\"";
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static boolean matches(String ifNoneMatch, String etag) {
        if (ifNoneMatch == null || ifNoneMatch.isBlank()) {
            return false;
        }
        if ("*".equals(ifNoneMatch.trim())) {
            return true;
        }
        for (String candidate : ifNoneMatch.split(",")) {
            String value = candidate.trim();
            if (value.startsWith("W/")) {
                value = value.substring(2);
            }
            if (value.equals(etag)) {
                return true;
            }
        }
        return false;
    }
}
