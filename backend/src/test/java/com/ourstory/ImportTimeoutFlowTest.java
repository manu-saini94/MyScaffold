package com.ourstory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ourstory.auth.PickerTokenProvider;
import com.ourstory.google.DownloadException;
import com.ourstory.google.ImageVariant;
import com.ourstory.google.MediaDownloader;
import com.ourstory.google.MediaDownloader.DownloadedImage;
import com.ourstory.google.PickerClient;
import com.ourstory.google.PickerModels.MediaFile;
import com.ourstory.google.PickerModels.PickedMediaItem;
import com.ourstory.google.PickerModels.PickerSession;
import com.ourstory.media.MediaRepository;
import com.ourstory.media.google.ImportJobRegistry;
import java.awt.Color;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/** A job that hangs is failed at its deadline, its workers are cancelled and no files are left behind. */
@SpringBootTest(properties = {
        "ourstory.import-job.job-timeout=1s",
        "spring.datasource.url=jdbc:h2:mem:ourstory-timeout-flow-test;DB_CLOSE_DELAY=-1"})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ImportTimeoutFlowTest {

    private static final String SESSION = "sess_timeout1";

    @Autowired MockMvc mvc;
    @Autowired ImportJobRegistry registry;
    @Autowired MediaRepository media;
    @Autowired JdbcClient jdbc;

    @MockitoBean PickerTokenProvider tokens;
    @MockitoBean PickerClient picker;
    @MockitoBean MediaDownloader downloader;

    @Test
    void aHangingDownloadEndsAsTimedOutWithoutOrphanFiles() throws Exception {
        byte[] jpeg = TestSupport.jpeg(Color.GREEN, 32, 32);
        when(tokens.accessToken(any())).thenReturn("tok");
        when(picker.getSession("tok", SESSION)).thenReturn(new PickerSession(SESSION, null, null, null, true));
        when(picker.listAllMediaItems("tok", SESSION)).thenReturn(List.of(new PickedMediaItem("hang", null, "PHOTO",
                new MediaFile("https://lh3.googleusercontent.com/hang", "image/jpeg", "hang.jpg", null))));
        when(downloader.download(anyString(), anyString(), any(ImageVariant.class))).thenAnswer(inv -> {
            if (inv.getArgument(2) != ImageVariant.MEDIUM) {
                return new DownloadedImage(jpeg, "image/jpeg"); // lqip and thumb succeed and hit the disk
            }
            try {
                Thread.sleep(30_000); // the medium download hangs
            } catch (InterruptedException e) {
                throw new DownloadException("interrupted", false); // what the real downloader does
            }
            return new DownloadedImage(jpeg, "image/jpeg");
        });

        mvc.perform(post("/api/admin/picker/sessions/" + SESSION + "/import")
                        .with(oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))).with(csrf()))
                .andExpect(status().isAccepted());

        String jobId = jdbc.sql("SELECT id FROM import_job").query(String.class).single();
        await().atMost(Duration.ofSeconds(15)).until(() ->
                !ImportJobRegistry.RUNNING.equals(registry.find(jobId).orElseThrow().status()));
        var job = registry.find(jobId).orElseThrow();
        assertThat(job.status()).isEqualTo(ImportJobRegistry.FAILED);
        assertThat(job.error()).isEqualTo("Import timed out");
        assertThat(registry.hasRunning()).isFalse();
        assertThat(media.count()).isZero();

        Path root = Path.of("target/test-data/media").toAbsolutePath();
        await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> {
            if (Files.isDirectory(root)) {
                try (Stream<Path> dirs = Files.list(root)) {
                    assertThat(dirs.filter(d -> !media.existsById(d.getFileName().toString())).toList()).isEmpty();
                }
            }
        });
        jdbc.sql("DELETE FROM import_job").update();
    }
}
