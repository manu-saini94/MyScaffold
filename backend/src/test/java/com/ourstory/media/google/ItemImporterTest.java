package com.ourstory.media.google;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ourstory.TestSupport;
import com.ourstory.common.UlidGenerator;
import com.ourstory.google.ImageVariant;
import com.ourstory.google.MediaDownloader;
import com.ourstory.google.MediaDownloader.DownloadedImage;
import com.ourstory.google.PickerModels.MediaFile;
import com.ourstory.google.PickerModels.PickedMediaItem;
import com.ourstory.media.DiskFullException;
import com.ourstory.media.MediaRecord;
import com.ourstory.media.MediaRepository;
import com.ourstory.media.MediaSize;
import com.ourstory.media.MediaStorage;
import java.awt.Color;
import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DuplicateKeyException;

class ItemImporterTest {

    private final MediaDownloader downloader = mock(MediaDownloader.class);
    private final MediaStorage storage = mock(MediaStorage.class);
    private final MediaRepository repository = mock(MediaRepository.class);
    private final ItemImporter importer = new ItemImporter(downloader, storage, repository, new UlidGenerator(),
            Clock.fixed(Instant.parse("2026-10-01T00:00:00Z"), ZoneOffset.UTC));

    private final byte[] small = TestSupport.jpeg(new Color(20, 40, 200), 32, 32);

    private static PickedMediaItem photo() {
        return new PickedMediaItem("g1", "2024-05-01T10:00:00Z", "PHOTO",
                new MediaFile("https://lh3.googleusercontent.com/x", "image/jpeg", "a.jpg", null));
    }

    private void downloads(String lqipType, byte[] lqipBytes) {
        when(downloader.download(anyString(), anyString(), any(ImageVariant.class))).thenAnswer(inv ->
                inv.getArgument(2) == ImageVariant.LQIP
                        ? new DownloadedImage(lqipBytes, lqipType) : new DownloadedImage(small, "image/jpeg"));
    }

    private MediaRecord insertedRecord() {
        ArgumentCaptor<MediaRecord> captor = ArgumentCaptor.forClass(MediaRecord.class);
        verify(repository).insert(captor.capture());
        return captor.getValue();
    }

    @Test
    void aLostDuplicateKeyRaceCleansUpAndCountsAsAlreadyImported() {
        downloads("image/jpeg", small);
        doThrow(new DuplicateKeyException("uq_media_google_media_id")).when(repository).insert(any());

        ItemImporter.Result result = importer.importItem(photo(), () -> "tok");

        assertThat(result.kind()).isEqualTo(ItemImporter.Kind.SKIPPED);
        assertThat(result.reason()).isEqualTo("already_imported");
        assertThat(result.record()).isFalse(); // counted, not listed
        ArgumentCaptor<String> mediaId = ArgumentCaptor.forClass(String.class);
        verify(storage).deleteAll(mediaId.capture()); // the files written for the losing attempt are removed
        assertThat(UlidGenerator.isValid(mediaId.getValue())).isTrue();
    }

    @Test
    void aFullDiskFailsTheItemWithDiskFullAndLeavesNothingBehind() throws IOException {
        downloads("image/jpeg", small);
        doThrow(new DiskFullException()).when(storage).write(anyString(), eq(MediaSize.THUMB), any());
        ItemImporter.Result result = importer.importItem(photo(), () -> "tok");
        assertThat(result.kind()).isEqualTo(ItemImporter.Kind.FAILED);
        assertThat(result.reason()).isEqualTo("disk_full");
        verify(storage).deleteAll(anyString());
        verify(repository, never()).insert(any());
    }

    @Test
    void otherStorageErrorsAreStorageError() throws IOException {
        downloads("image/jpeg", small);
        doThrow(new IOException("io")).when(storage).write(anyString(), any(), any());
        assertThat(importer.importItem(photo(), () -> "tok").reason()).isEqualTo("storage_error");
    }

    @Test
    void onlyJpegPngAndWebpPlaceholdersBecomeDataUris() {
        for (String type : new String[] {"image/jpeg", "image/png", "image/webp"}) {
            org.mockito.Mockito.reset(repository);
            downloads(type, small);
            importer.importItem(photo(), () -> "tok");
            assertThat(insertedRecord().lqip()).startsWith("data:" + type + ";base64,");
        }
    }

    @Test
    void otherPlaceholderTypesAreStoredAsNoPlaceholderButStillImport() {
        for (String type : new String[] {"image/svg+xml", "image/gif", "image/x-icon", "image/tiff"}) {
            org.mockito.Mockito.reset(repository);
            downloads(type, small);
            ItemImporter.Result result = importer.importItem(photo(), () -> "tok");
            assertThat(result.kind()).as(type).isEqualTo(ItemImporter.Kind.IMPORTED);
            assertThat(insertedRecord().lqip()).as(type).isNull();
        }
    }

    @Test
    void oversizedPlaceholdersGetNoDominantColorButStillImport() {
        downloads("image/jpeg", TestSupport.jpeg(Color.RED, 700, 700));
        importer.importItem(photo(), () -> "tok");
        MediaRecord record = insertedRecord();
        assertThat(record.dominantColor()).isNull();
        assertThat(record.lqip()).startsWith("data:image/jpeg;base64,");
    }

    @Test
    void aNormalPlaceholderGetsItsDominantColor() {
        downloads("image/jpeg", small);
        importer.importItem(photo(), () -> "tok");
        assertThat(insertedRecord().dominantColor()).matches("^#[0-9a-f]{6}$");
    }
}
