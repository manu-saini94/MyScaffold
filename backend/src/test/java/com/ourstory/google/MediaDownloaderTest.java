package com.ourstory.google;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.ExpectedCount.times;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.ourstory.TestSupport;
import java.awt.Color;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.client.response.MockRestResponseCreators;
import org.springframework.web.client.RestClient;

class MediaDownloaderTest {

    private static final String BASE = "https://lh3.googleusercontent.com/pw/AbC123";

    private MockRestServiceServer server;
    private MediaDownloader downloader;
    private final List<Long> pauses = new ArrayList<>();
    private final byte[] jpeg = TestSupport.jpeg(Color.RED, 8, 8);

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        downloader = new MediaDownloader(builder.build(),
                TestSupport.props("./data", "a@b.c", List.of("googleusercontent.com"), 4096, 3), pauses::add);
    }

    @Test
    void requestsEachVariantSizeWithBearer() {
        for (ImageVariant variant : ImageVariant.values()) {
            server.expect(requestTo(BASE + variant.suffix()))
                    .andExpect(header("Authorization", "Bearer tok"))
                    .andRespond(withSuccess(jpeg, MediaType.IMAGE_JPEG));
        }
        assertThat(ImageVariant.LQIP.suffix()).isEqualTo("=w32-h32");
        assertThat(ImageVariant.THUMB.suffix()).isEqualTo("=w480-h480");
        assertThat(ImageVariant.MEDIUM.suffix()).isEqualTo("=w1280-h1280");
        assertThat(ImageVariant.FULL.suffix()).isEqualTo("=w2560-h2560");
        for (ImageVariant variant : ImageVariant.values()) {
            var image = downloader.download("tok", BASE, variant);
            assertThat(image.bytes()).isEqualTo(jpeg);
            assertThat(image.contentType()).isEqualTo("image/jpeg");
        }
        server.verify();
    }

    @Test
    void retriesOn429And5xxWithGrowingBackoffThenSucceeds() {
        String url = BASE + "=w32-h32";
        server.expect(requestTo(url)).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS));
        server.expect(requestTo(url)).andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));
        server.expect(requestTo(url)).andRespond(withSuccess(jpeg, MediaType.IMAGE_JPEG));
        assertThat(downloader.download("tok", BASE, ImageVariant.LQIP).bytes()).isEqualTo(jpeg);
        assertThat(pauses).hasSize(2);
        assertThat(pauses.get(0)).isBetween(10L, 20L);   // base 10ms + jitter 0..10
        assertThat(pauses.get(1)).isBetween(20L, 30L);   // doubled
        server.verify();
    }

    @Test
    void givesUpAfterMaxAttempts() {
        server.expect(times(3), requestTo(BASE + "=w32-h32")).andRespond(withStatus(HttpStatus.BAD_GATEWAY));
        assertThatThrownBy(() -> downloader.download("tok", BASE, ImageVariant.LQIP))
                .isInstanceOfSatisfying(DownloadException.class, e -> {
                    assertThat(e.reason()).isEqualTo("http_502_retries_exhausted");
                    assertThat(e.isUnauthorized()).isFalse();
                });
        assertThat(pauses).hasSize(2);
    }

    @Test
    void retriesIoErrors() {
        String url = BASE + "=w32-h32";
        server.expect(requestTo(url)).andRespond(MockRestResponseCreators.withException(new IOException("reset")));
        server.expect(requestTo(url)).andRespond(withSuccess(jpeg, MediaType.IMAGE_JPEG));
        assertThat(downloader.download("tok", BASE, ImageVariant.LQIP).bytes()).isEqualTo(jpeg);
    }

    @Test
    void interruptedBackoffEndsTheDownload() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer local = MockRestServiceServer.bindTo(builder).build();
        MediaDownloader interrupted = new MediaDownloader(builder.build(),
                TestSupport.props("./data", "a@b.c", List.of("googleusercontent.com"), 4096, 3), ms -> {
                    throw new InterruptedException();
                });
        local.expect(requestTo(BASE + "=w32-h32")).andRespond(withStatus(HttpStatus.BAD_GATEWAY));
        assertThatThrownBy(() -> interrupted.download("tok", BASE, ImageVariant.LQIP))
                .isInstanceOfSatisfying(DownloadException.class, e -> assertThat(e.reason()).isEqualTo("interrupted"));
        assertThat(Thread.interrupted()).isTrue(); // flag was restored; clear it for other tests
    }

    @Test
    void unauthorizedIsNotRetriedAndFlagged() {
        server.expect(requestTo(BASE + "=w32-h32")).andRespond(withStatus(HttpStatus.UNAUTHORIZED));
        assertThatThrownBy(() -> downloader.download("tok", BASE, ImageVariant.LQIP))
                .isInstanceOfSatisfying(DownloadException.class, e -> assertThat(e.isUnauthorized()).isTrue());
        assertThat(pauses).isEmpty();
    }

    @Test
    void otherClientErrorsFailImmediately() {
        server.expect(requestTo(BASE + "=w32-h32")).andRespond(withStatus(HttpStatus.FORBIDDEN));
        assertThatThrownBy(() -> downloader.download("tok", BASE, ImageVariant.LQIP))
                .isInstanceOfSatisfying(DownloadException.class, e -> assertThat(e.reason()).isEqualTo("http_403"));
    }

    @Test
    void redirectStatusesAreFailuresAndNeverRetried() {
        server.expect(requestTo(BASE + "=w32-h32"))
                .andRespond(withStatus(HttpStatus.FOUND).header("Location", "https://evil.example/x"));
        assertThatThrownBy(() -> downloader.download("tok", BASE, ImageVariant.LQIP))
                .isInstanceOfSatisfying(DownloadException.class, e -> assertThat(e.reason()).isEqualTo("http_3xx"));
        assertThat(pauses).isEmpty();
    }

    @Test
    void rejectsNonImageContentTypes() {
        server.expect(requestTo(BASE + "=w32-h32"))
                .andRespond(withSuccess("<html>nope</html>", MediaType.TEXT_HTML));
        assertThatThrownBy(() -> downloader.download("tok", BASE, ImageVariant.LQIP))
                .isInstanceOfSatisfying(DownloadException.class, e -> assertThat(e.reason()).isEqualTo("not_an_image"));
    }

    @Test
    void rejectsMissingContentType() {
        server.expect(requestTo(BASE + "=w32-h32")).andRespond(withSuccess(jpeg, null));
        assertThatThrownBy(() -> downloader.download("tok", BASE, ImageVariant.LQIP))
                .isInstanceOfSatisfying(DownloadException.class, e -> assertThat(e.reason()).isEqualTo("not_an_image"));
    }

    @Test
    void boundsTheBodySize() {
        server.expect(requestTo(BASE + "=w32-h32"))
                .andRespond(withSuccess(new byte[5000], MediaType.IMAGE_JPEG));
        assertThatThrownBy(() -> downloader.download("tok", BASE, ImageVariant.LQIP))
                .isInstanceOfSatisfying(DownloadException.class, e -> assertThat(e.reason()).isEqualTo("too_large"));
    }

    @Test
    void lqipBodyIsCappedAt16KiBEvenWhenTheGeneralLimitIsHigher() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer local = MockRestServiceServer.bindTo(builder).build();
        MediaDownloader big = new MediaDownloader(builder.build(),
                TestSupport.props("./data", "a@b.c", List.of("googleusercontent.com"), 1_000_000, 1), pauses::add);
        local.expect(requestTo(BASE + "=w32-h32"))
                .andRespond(withSuccess(new byte[17 * 1024], MediaType.IMAGE_JPEG));
        local.expect(requestTo(BASE + "=w480-h480"))
                .andRespond(withSuccess(new byte[17 * 1024], MediaType.IMAGE_JPEG));
        assertThatThrownBy(() -> big.download("tok", BASE, ImageVariant.LQIP))
                .isInstanceOfSatisfying(DownloadException.class, e -> assertThat(e.reason()).isEqualTo("too_large"));
        assertThat(big.download("tok", BASE, ImageVariant.THUMB).bytes()).hasSize(17 * 1024);
    }

    @Test
    void neverSendsTheTokenToUntrustedHostsOrPlainHttp() {
        for (String bad : List.of("https://evil.example.com/x", "http://lh3.googleusercontent.com/x",
                "https://googleusercontent.com.evil.io/x", "not a url", "ftp://lh3.googleusercontent.com/x")) {
            assertThatThrownBy(() -> downloader.download("tok", bad, ImageVariant.LQIP))
                    .isInstanceOfSatisfying(DownloadException.class, e ->
                            assertThat(e.reason()).isIn("untrusted_host", "invalid_base_url"));
        }
        server.verify(); // no request was made
    }

    @Test
    void exceptionsNeverContainTokenOrUrl() {
        server.expect(requestTo(BASE + "=w32-h32")).andRespond(withStatus(HttpStatus.FORBIDDEN));
        assertThatThrownBy(() -> downloader.download("super-secret-token", BASE, ImageVariant.LQIP))
                .hasMessageNotContaining("super-secret-token").hasMessageNotContaining("AbC123");
    }
}
