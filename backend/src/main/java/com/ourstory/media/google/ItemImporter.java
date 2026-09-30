package com.ourstory.media.google;

import com.ourstory.common.GoogleReconnectRequiredException;
import com.ourstory.common.UlidGenerator;
import com.ourstory.google.DownloadException;
import com.ourstory.google.ImageVariant;
import com.ourstory.google.MediaDownloader;
import com.ourstory.google.MediaDownloader.DownloadedImage;
import com.ourstory.google.PickerModels.MediaFile;
import com.ourstory.google.PickerModels.PickedMediaItem;
import com.ourstory.media.DiskFullException;
import com.ourstory.media.ImageStats;
import com.ourstory.media.MediaRecord;
import com.ourstory.media.MediaRepository;
import com.ourstory.media.MediaSize;
import com.ourstory.media.MediaStorage;
import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.Set;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Component;

/** Imports one picked photo: download 4 sizes, write files atomically, then insert the DB row last. */
@Component
class ItemImporter {

    private static final Logger log = LoggerFactory.getLogger(ItemImporter.class);
    /** Only these become a data: URI; anything else is stored as "no placeholder". */
    static final Set<String> LQIP_TYPES = Set.of("image/jpeg", "image/png", "image/webp");

    enum Kind { IMPORTED, SKIPPED, FAILED }

    record Result(Kind kind, String reason, boolean record) {
        static Result imported() {
            return new Result(Kind.IMPORTED, null, false);
        }

        /** Skipped and worth listing in the job report. */
        static Result skipped(String reason) {
            return new Result(Kind.SKIPPED, reason, true);
        }

        /** Already present: counted, not listed. */
        static Result alreadyImported() {
            return new Result(Kind.SKIPPED, "already_imported", false);
        }

        static Result failed(String reason) {
            return new Result(Kind.FAILED, reason, true);
        }
    }

    private final MediaDownloader downloader;
    private final MediaStorage storage;
    private final MediaRepository repository;
    private final UlidGenerator ulids;
    private final Clock clock;

    @Autowired
    ItemImporter(MediaDownloader downloader, MediaStorage storage, MediaRepository repository,
            UlidGenerator ulids) {
        this(downloader, storage, repository, ulids, Clock.systemUTC());
    }

    ItemImporter(MediaDownloader downloader, MediaStorage storage, MediaRepository repository,
            UlidGenerator ulids, Clock clock) {
        this.downloader = downloader;
        this.storage = storage;
        this.repository = repository;
        this.ulids = ulids;
        this.clock = clock;
    }

    /**
     * @param token supplies a fresh access token per call
     * @throws GoogleReconnectRequiredException when Google rejects the token (job must stop)
     */
    Result importItem(PickedMediaItem item, Supplier<String> token) {
        if (item == null || item.id() == null || item.id().isBlank()) {
            return Result.failed("invalid_item");
        }
        MediaFile file = item.mediaFile();
        if (item.isVideo()) {
            return Result.skipped("unsupported_type");
        }
        if (file == null || file.baseUrl() == null || file.baseUrl().isBlank()) {
            return Result.failed("missing_base_url");
        }
        if (repository.existsByGoogleMediaId(item.id())) {
            return Result.alreadyImported();
        }
        String mediaId = ulids.next();
        try {
            return download(item, file, mediaId, token);
        } catch (DownloadException e) {
            storage.deleteAll(mediaId);
            if (e.isUnauthorized()) {
                throw new GoogleReconnectRequiredException();
            }
            return Result.failed(e.reason());
        } catch (DiskFullException e) {
            storage.deleteAll(mediaId);
            return Result.failed("disk_full");
        } catch (IOException e) {
            storage.deleteAll(mediaId);
            return Result.failed("storage_error");
        } catch (RuntimeException e) {
            storage.deleteAll(mediaId);
            if (e instanceof GoogleReconnectRequiredException reconnect) {
                throw reconnect;
            }
            log.warn("Unexpected failure importing an item: {}", e.getClass().getSimpleName());
            return Result.failed("unexpected_error");
        }
    }

    private Result download(PickedMediaItem item, MediaFile file, String mediaId, Supplier<String> token)
            throws IOException {
        DownloadedImage lqip = downloader.download(token.get(), file.baseUrl(), ImageVariant.LQIP);
        store(mediaId, MediaSize.THUMB, downloader.download(token.get(), file.baseUrl(), ImageVariant.THUMB));
        store(mediaId, MediaSize.MEDIUM, downloader.download(token.get(), file.baseUrl(), ImageVariant.MEDIUM));
        store(mediaId, MediaSize.FULL, downloader.download(token.get(), file.baseUrl(), ImageVariant.FULL));

        Integer width = file.mediaFileMetadata() == null ? null : file.mediaFileMetadata().width();
        Integer height = file.mediaFileMetadata() == null ? null : file.mediaFileMetadata().height();
        MediaRecord record = new MediaRecord(mediaId, item.id(), file.mimeType(), width, height,
                parseTime(item.createTime()), file.filename(), dataUri(lqip),
                ImageStats.dominantColor(lqip.bytes()),
                OffsetDateTime.ofInstant(clock.instant().truncatedTo(ChronoUnit.MILLIS), ZoneOffset.UTC));
        try {
            repository.insert(record);
        } catch (DuplicateKeyException e) {
            storage.deleteAll(mediaId); // lost a race against another importer of the same photo
            return Result.alreadyImported();
        }
        return Result.imported();
    }

    private void store(String mediaId, MediaSize size, DownloadedImage image) throws IOException {
        storage.write(mediaId, size, image.bytes());
    }

    /** A data: URI only for a whitelisted image type; otherwise no placeholder is stored. */
    private static String dataUri(DownloadedImage lqip) {
        String type = lqip.contentType() == null ? "" : lqip.contentType().toLowerCase(java.util.Locale.ROOT);
        if (!LQIP_TYPES.contains(type)) {
            log.warn("Placeholder has an unexpected content type; storing no placeholder");
            return null;
        }
        return "data:" + type + ";base64," + Base64.getEncoder().encodeToString(lqip.bytes());
    }

    private static OffsetDateTime parseTime(String value) {
        if (value == null) {
            return null;
        }
        try {
            return OffsetDateTime.ofInstant(Instant.parse(value), ZoneOffset.UTC);
        } catch (DateTimeParseException e) {
            return null;
        }
    }
}
