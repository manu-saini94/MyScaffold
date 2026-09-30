package com.ourstory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ourstory.auth.PickerTokenProvider;
import com.ourstory.common.GoogleReconnectRequiredException;
import com.ourstory.google.DownloadException;
import com.ourstory.google.ImageVariant;
import com.ourstory.google.MediaDownloader;
import com.ourstory.google.MediaDownloader.DownloadedImage;
import com.ourstory.google.PickerClient;
import com.ourstory.google.PickerModels.MediaFile;
import com.ourstory.google.PickerModels.MediaFileMetadata;
import com.ourstory.google.PickerModels.PickedMediaItem;
import com.ourstory.google.PickerModels.PickerSession;
import com.ourstory.media.MediaRecord;
import com.ourstory.media.MediaRepository;
import com.ourstory.media.MediaSize;
import com.ourstory.media.MediaStorage;
import com.ourstory.media.google.ImportJobRegistry;
import java.awt.Color;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/** End-to-end import job behaviour with Google replaced by mocks (real DB, real file storage). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ImportFlowTest {

    private static final String SESSION = "sess_import1";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired MediaRepository media;
    @Autowired MediaStorage storage;
    @Autowired ImportJobRegistry registry;
    @Autowired JdbcClient jdbc;

    @MockitoBean PickerTokenProvider tokens;
    @MockitoBean PickerClient picker;
    @MockitoBean MediaDownloader downloader;

    private final byte[] lqip = TestSupport.jpeg(new Color(200, 30, 30), 32, 32);
    private final byte[] big = TestSupport.jpeg(new Color(10, 10, 200), 64, 64);

    @BeforeEach
    void setUp() {
        when(tokens.accessToken(any())).thenReturn("tok");
        when(picker.getSession("tok", SESSION)).thenReturn(new PickerSession(SESSION, null, null, null, true));
        when(downloader.download(anyString(), anyString(), any(ImageVariant.class))).thenAnswer(inv ->
                new DownloadedImage(inv.getArgument(2) == ImageVariant.LQIP ? lqip : big, "image/jpeg"));
    }

    @AfterEach
    void cleanUp() {
        jdbc.sql("SELECT id FROM media").query(String.class).list().forEach(storage::deleteAll);
        jdbc.sql("DELETE FROM media").update();
        jdbc.sql("DELETE FROM import_job").update();
    }

    private static PickedMediaItem photo(String id, String name) {
        return photo(id, name, id);
    }

    /** A picked photo whose Google media id is {@code mediaId} and whose baseUrl path is {@code id}. */
    private static PickedMediaItem photo(String id, String name, String mediaId) {
        return new PickedMediaItem(mediaId, "2024-05-01T10:00:00Z", "PHOTO", new MediaFile(
                "https://lh3.googleusercontent.com/" + id, "image/jpeg", name, new MediaFileMetadata(4000, 3000)));
    }

    private static PickedMediaItem video(String id) {
        return new PickedMediaItem(id, "2024-05-01T10:00:00Z", "VIDEO", new MediaFile(
                "https://lh3.googleusercontent.com/" + id, "video/mp4", id + ".mp4", null));
    }

    private String startImport() throws Exception {
        String body = mvc.perform(post("/api/admin/picker/sessions/" + SESSION + "/import")
                        .with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))).with(csrf()))
                .andExpect(status().isAccepted()).andExpect(jsonPath("$.jobId").exists())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(body).get("jobId").asText();
    }

    private JsonNode awaitFinished(String jobId) throws Exception {
        await().atMost(Duration.ofSeconds(20)).until(() ->
                !ImportJobRegistry.RUNNING.equals(registry.find(jobId).orElseThrow().status()));
        String body = mvc.perform(get("/api/admin/imports/" + jobId)
                        .with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json.readTree(body);
    }

    @Test
    void importsPhotosSkipsVideosAndDuplicatesAndRecordsFailuresWithoutAborting() throws Exception {
        media.insert(new MediaRecord("01HZZZZZZZZZZZZZZZZZZZZZZZ".replace('Z', '0'), "dup", "image/jpeg", 1, 1, null,
                "dup.jpg", null, null, OffsetDateTime.now(ZoneOffset.UTC)));
        when(picker.listAllMediaItems("tok", SESSION)).thenReturn(List.of(
                photo("a", "a.jpg"), photo("b", "b.jpg"), photo("bad", "bad.jpg"), video("v"), photo("dup", "dup.jpg")));
        when(downloader.download(anyString(), eq("https://lh3.googleusercontent.com/bad"), any(ImageVariant.class)))
                .thenThrow(new DownloadException("http_410", false));

        JsonNode job = awaitFinished(startImport());

        assertThat(job.get("status").asText()).isEqualTo("COMPLETED");
        assertThat(job.get("total").asInt()).isEqualTo(5);
        assertThat(job.get("done").asInt()).isEqualTo(2);
        assertThat(job.get("failed").asInt()).isEqualTo(1);
        assertThat(job.get("skipped").asInt()).isEqualTo(2);
        List<String> failures = new ArrayList<>();
        job.get("failures").forEach(f -> failures.add(f.get("filename").asText() + ":" + f.get("outcome").asText()
                + ":" + f.get("reason").asText()));
        assertThat(failures).containsExactlyInAnyOrder("bad.jpg:failed:http_410", "v.mp4:skipped:unsupported_type");

        MediaRecord a = media.findPage(0, 10).stream().filter(m -> "a".equals(m.googleMediaId())).findFirst().orElseThrow();
        assertThat(a.lqip()).startsWith("data:image/jpeg;base64,");
        assertThat(a.dominantColor()).matches("^#[0-9a-f]{6}$");
        assertThat(a.width()).isEqualTo(4000);
        assertThat(a.takenAt()).isNotNull();
        for (MediaSize size : MediaSize.values()) {
            assertThat(storage.find(a.id(), size)).isPresent();
        }
        // The failed item left nothing behind (no row, no files).
        assertThat(media.existsByGoogleMediaId("bad")).isFalse();
        assertThat(media.count()).isEqualTo(3); // a, b and the pre-existing dup
        assertNoOrphans();
        verify(picker).deleteSession("tok", SESSION);
        // The imported photo is immediately servable to the admin.
        mvc.perform(get("/api/media/" + a.id() + "/full")
                        .with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isOk());
    }

    @Test
    void isIdempotentAcrossRuns() throws Exception {
        when(picker.listAllMediaItems("tok", SESSION)).thenReturn(List.of(photo("a", "a.jpg"), photo("b", "b.jpg")));
        JsonNode first = awaitFinished(startImport());
        JsonNode second = awaitFinished(startImport());
        assertThat(first.get("done").asInt()).isEqualTo(2);
        assertThat(second.get("done").asInt()).isZero();
        assertThat(second.get("skipped").asInt()).isEqualTo(2);
        assertThat(media.count()).isEqualTo(2);
    }

    @Test
    void marksJobFailedWhenTheTokenDiesMidImportAndStillDeletesTheSession() throws Exception {
        when(picker.listAllMediaItems("tok", SESSION)).thenReturn(List.of(photo("a", "a.jpg"), photo("b", "b.jpg")));
        when(downloader.download(anyString(), anyString(), any(ImageVariant.class)))
                .thenThrow(new DownloadException("unauthorized", true));
        JsonNode job = awaitFinished(startImport());
        assertThat(job.get("status").asText()).isEqualTo("FAILED");
        assertThat(job.get("error").asText()).contains("Reconnect Google Photos");
        assertThat(media.count()).isZero();
        assertNoOrphans();
        verify(picker).deleteSession("tok", SESSION);
    }

    @Test
    void marksJobFailedWhenRefreshFailsMidImport() throws Exception {
        // Deterministic, independent of how many token calls the importer makes: the token is revoked the
        // moment the first download happens, so every later token request fails.
        AtomicBoolean revoked = new AtomicBoolean();
        when(tokens.accessToken(any())).thenAnswer(inv -> {
            if (revoked.get()) {
                throw new GoogleReconnectRequiredException();
            }
            return "tok";
        });
        when(picker.listAllMediaItems("tok", SESSION)).thenReturn(List.of(photo("a", "a.jpg")));
        when(downloader.download(anyString(), anyString(), any(ImageVariant.class))).thenAnswer(inv -> {
            revoked.set(true);
            return new DownloadedImage(inv.getArgument(2) == ImageVariant.LQIP ? lqip : big, "image/jpeg");
        });
        JsonNode job = awaitFinished(startImport());
        assertThat(job.get("status").asText()).isEqualTo("FAILED");
        assertThat(job.get("error").asText()).contains("Reconnect Google Photos");
        assertThat(media.count()).isZero();
        assertNoOrphans();
    }

    @Test
    void keepsThePickerSessionWhenNothingWasPickedYet() throws Exception {
        when(picker.getSession("tok", SESSION)).thenReturn(new PickerSession(SESSION, null, null, null, false));
        JsonNode job = awaitFinished(startImport());
        assertThat(job.get("status").asText()).isEqualTo("FAILED");
        assertThat(job.get("error").asText()).contains("no selection");
        verify(picker, never()).listAllMediaItems(any(), any());
        verify(picker, never()).deleteSession(any(), any()); // the user can retry until the session expires
    }

    @Test
    void relistsOnceAndRetriesWhenBaseUrlsExpired() throws Exception {
        when(picker.listAllMediaItems("tok", SESSION))
                .thenReturn(List.of(photo("old-a", "a.jpg")))
                .thenReturn(List.of(photo("fresh-a", "a.jpg", "old-a")));
        when(downloader.download(anyString(), anyString(), any(ImageVariant.class))).thenAnswer(inv -> {
            if (((String) inv.getArgument(1)).contains("/old-a")) {
                throw new DownloadException("http_403", false);
            }
            return new DownloadedImage(inv.getArgument(2) == ImageVariant.LQIP ? lqip : big, "image/jpeg");
        });
        JsonNode job = awaitFinished(startImport());
        assertThat(job.get("status").asText()).isEqualTo("COMPLETED");
        assertThat(job.get("done").asInt()).isEqualTo(1);
        verify(picker, org.mockito.Mockito.times(2)).listAllMediaItems("tok", SESSION);
        assertNoOrphans();
    }

    @Test
    void recordsTheClearMessageWhenALinkStaysExpired() throws Exception {
        when(picker.listAllMediaItems("tok", SESSION)).thenReturn(List.of(photo("a", "a.jpg")));
        when(downloader.download(anyString(), anyString(), any(ImageVariant.class)))
                .thenThrow(new DownloadException("http_404", false));
        JsonNode job = awaitFinished(startImport());
        assertThat(job.get("status").asText()).isEqualTo("COMPLETED");
        assertThat(job.get("failed").asInt()).isEqualTo(1);
        assertThat(job.get("failures").get(0).get("reason").asText())
                .startsWith("baseurl_expired").contains("Google download link expired");
        assertNoOrphans();
    }

    @Test
    void failsWhenThePickerSelectionIsNotFinished() throws Exception {
        when(picker.getSession("tok", SESSION)).thenReturn(new PickerSession(SESSION, null, null, null, false));
        JsonNode job = awaitFinished(startImport());
        assertThat(job.get("status").asText()).isEqualTo("FAILED");
        assertThat(job.get("error").asText()).contains("no selection");
        verify(picker, never()).listAllMediaItems(any(), any());
    }

    @Test
    void leavesNoFilesBehindAfterFailedItems() throws Exception {
        when(picker.listAllMediaItems("tok", SESSION)).thenReturn(List.of(photo("ok", "ok.jpg"), photo("bad", "bad.jpg")));
        // The third download (medium) of "bad" fails after thumb was already written to disk.
        when(downloader.download(anyString(), eq("https://lh3.googleusercontent.com/bad"), eq(ImageVariant.MEDIUM)))
                .thenThrow(new DownloadException("http_500_retries_exhausted", false));
        JsonNode job = awaitFinished(startImport());
        assertThat(job.get("done").asInt()).isEqualTo(1);
        assertThat(job.get("failed").asInt()).isEqualTo(1);
        assertNoOrphans();
    }

    /** Every media directory on disk belongs to a DB row and no temp file is left anywhere. */
    private void assertNoOrphans() throws java.io.IOException {
        Path root = Path.of("target/test-data/media").toAbsolutePath();
        if (!Files.isDirectory(root)) {
            return;
        }
        try (Stream<Path> dirs = Files.list(root)) {
            for (Path dir : dirs.toList()) {
                assertThat(media.existsById(dir.getFileName().toString()))
                        .as("directory %s must have a DB row", dir.getFileName()).isTrue();
            }
        }
        try (Stream<Path> all = Files.walk(root)) {
            assertThat(all.filter(p -> p.getFileName().toString().endsWith(".tmp")).toList()).isEmpty();
        }
    }

    @Test
    void googleErrorsDuringListingFailTheJobCleanly() throws Exception {
        when(picker.listAllMediaItems("tok", SESSION)).thenThrow(new com.ourstory.google.GoogleApiException(500));
        JsonNode job = awaitFinished(startImport());
        assertThat(job.get("status").asText()).isEqualTo("FAILED");
        assertThat(job.get("error").asText()).contains("HTTP 500");
    }

    @Test
    void unexpectedCrashesAreRecordedWithAGenericMessage() throws Exception {
        when(picker.listAllMediaItems("tok", SESSION)).thenThrow(new IllegalStateException("kaboom secret"));
        JsonNode job = awaitFinished(startImport());
        assertThat(job.get("status").asText()).isEqualTo("FAILED");
        assertThat(job.get("error").asText()).isEqualTo("Internal error during import");
    }

    @Test
    void recordsPerItemFailureForUnexpectedItemErrorsAndInvalidItems() throws Exception {
        when(picker.listAllMediaItems("tok", SESSION)).thenReturn(List.of(
                photo("boom", "boom.jpg"),
                new PickedMediaItem(" ", null, "PHOTO", null),
                new PickedMediaItem("nourl", null, "PHOTO", new MediaFile(null, "image/jpeg", "nourl.jpg", null))));
        when(downloader.download(anyString(), eq("https://lh3.googleusercontent.com/boom"), any(ImageVariant.class)))
                .thenThrow(new IllegalStateException("weird"));
        JsonNode job = awaitFinished(startImport());
        assertThat(job.get("failed").asInt()).isEqualTo(3);
        List<String> reasons = new ArrayList<>();
        job.get("failures").forEach(f -> reasons.add(f.get("reason").asText()));
        assertThat(reasons).containsExactlyInAnyOrder("unexpected_error", "invalid_item", "missing_base_url");
    }

    @Test
    void neverRunsMoreThanConfiguredConcurrencyAndRejectsASecondJob() throws Exception {
        List<PickedMediaItem> items = new ArrayList<>();
        for (int i = 0; i < 12; i++) {
            items.add(photo("p" + i, "p" + i + ".jpg"));
        }
        when(picker.listAllMediaItems("tok", SESSION)).thenReturn(items);
        AtomicInteger running = new AtomicInteger();
        AtomicInteger peak = new AtomicInteger();
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        when(downloader.download(anyString(), anyString(), any(ImageVariant.class))).thenAnswer(inv -> {
            if (inv.getArgument(2) == ImageVariant.LQIP) {
                int now = running.incrementAndGet();
                peak.accumulateAndGet(now, Math::max);
                started.countDown();
                release.await(5, TimeUnit.SECONDS);
                Thread.sleep(20);
                running.decrementAndGet();
                return new DownloadedImage(lqip, "image/jpeg");
            }
            return new DownloadedImage(big, "image/jpeg");
        });

        String jobId = startImport();
        assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
        // A second job while one is running is refused.
        mvc.perform(post("/api/admin/picker/sessions/" + SESSION + "/import")
                        .with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))).with(csrf()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.type").value("urn:ourstory:problem:import-already-running"));
        // Progress is visible while running.
        assertThat(registry.find(jobId).orElseThrow().status()).isEqualTo(ImportJobRegistry.RUNNING);
        release.countDown();

        JsonNode job = awaitFinished(jobId);
        assertThat(job.get("done").asInt()).isEqualTo(12);
        assertThat(peak.get()).isBetween(2, 4);
    }

    @Test
    void interruptedJobsAreMarkedFailedOnRecovery() {
        registry.create("01J00000000000000000000000", SESSION);
        assertThat(registry.failInterrupted()).isEqualTo(1);
        var job = registry.find("01J00000000000000000000000").orElseThrow();
        assertThat(job.status()).isEqualTo(ImportJobRegistry.FAILED);
        assertThat(job.error()).contains("restart");
        assertThat(job.finishedAt()).isNotNull();
        verify(picker, never()).deleteSession(any(), any());
    }
}
