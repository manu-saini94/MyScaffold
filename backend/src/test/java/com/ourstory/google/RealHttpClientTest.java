package com.ourstory.google;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ourstory.TestSupport;
import com.ourstory.config.OurStoryProperties;
import java.awt.Color;
import java.io.IOException;
import java.io.OutputStream;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

/**
 * Tests against REAL loopback HTTP servers, so the production RestClient wiring (no redirects, deadlines)
 * is exercised, unlike MockRestServiceServer which replaces the request factory. Plain http and 127.0.0.1
 * are allowed only through the test-only ourstory.google.allow-insecure-http switch.
 */
class RealHttpClientTest {

    private final byte[] jpeg = TestSupport.jpeg(Color.BLUE, 8, 8);
    private final List<Long> pauses = new ArrayList<>();

    private OurStoryProperties props(String pickerBase, boolean insecure, Duration downloadTimeout, int attempts) {
        return TestSupport.props("./data", "a@b.c", List.of("127.0.0.1"), 100_000, attempts, pickerBase, insecure,
                Duration.ofHours(1), downloadTimeout, 0);
    }

    private MediaDownloader downloader(OurStoryProperties props) {
        return new MediaDownloader(GoogleHttpClients.noRedirect(RestClient.builder()).build(), props, pauses::add);
    }

    private PickerClient picker(String base, int attempts) {
        OurStoryProperties props = props(base, true, Duration.ofSeconds(5), attempts);
        return new PickerClient(GoogleHttpClients.noRedirect(RestClient.builder()).baseUrl(base).build(), props,
                pauses::add);
    }

    private static void redirectTo(com.sun.net.httpserver.HttpExchange exchange, String location)
            throws IOException {
        exchange.getResponseHeaders().add("Location", location);
        exchange.sendResponseHeaders(302, -1);
    }

    @Test
    void downloaderNeverFollowsARedirectAndTheTargetSeesNothing() throws Exception {
        try (LocalHttpServer target = LocalHttpServer.start(ex -> ex.sendResponseHeaders(200, -1))) {
            try (LocalHttpServer origin = LocalHttpServer.start(ex -> redirectTo(ex, target.base() + "/stolen"))) {
                MediaDownloader downloader = downloader(props("https://p.example", true, Duration.ofSeconds(5), 3));
                assertThatThrownBy(() -> downloader.download("secret-token", origin.base() + "/photo",
                        ImageVariant.THUMB))
                        .isInstanceOfSatisfying(DownloadException.class,
                                e -> assertThat(e.reason()).isEqualTo("http_3xx"));
                assertThat(origin.hits()).hasSize(1); // not retried
                assertThat(origin.hits().get(0).authorization()).isEqualTo("Bearer secret-token");
                assertThat(target.hits()).isEmpty();  // no request, so certainly no Authorization header
            }
        }
    }

    @Test
    void pickerClientNeverFollowsARedirectAndTheTargetSeesNothing() throws Exception {
        try (LocalHttpServer target = LocalHttpServer.start(ex -> ex.sendResponseHeaders(200, -1))) {
            try (LocalHttpServer origin = LocalHttpServer.start(ex -> redirectTo(ex, target.base() + "/stolen"))) {
                PickerClient client = picker(origin.base(), 3);
                assertThatThrownBy(() -> client.getSession("secret-token", "abc123"))
                        .isInstanceOf(GoogleApiException.class).hasMessageContaining("302");
                assertThatThrownBy(() -> client.createSession("secret-token", null))
                        .isInstanceOf(GoogleApiException.class);
                assertThat(origin.hits()).hasSize(2);
                assertThat(origin.hits()).allMatch(h -> "Bearer secret-token".equals(h.authorization()));
                assertThat(target.hits()).isEmpty();
            }
        }
    }

    @Test
    void downloaderReadsARealImageResponse() throws Exception {
        try (LocalHttpServer origin = LocalHttpServer.start(ex -> {
            ex.getResponseHeaders().add("Content-Type", "image/jpeg");
            ex.sendResponseHeaders(200, jpeg.length);
            try (OutputStream out = ex.getResponseBody()) {
                out.write(jpeg);
            }
        })) {
            MediaDownloader downloader = downloader(props("https://p.example", true, Duration.ofSeconds(5), 3));
            var image = downloader.download("tok", origin.base() + "/photo", ImageVariant.THUMB);
            assertThat(image.bytes()).isEqualTo(jpeg);
            assertThat(image.contentType()).isEqualTo("image/jpeg");
            assertThat(origin.hits().get(0).path()).isEqualTo("/photo=w480-h480");
        }
    }

    @Test
    void plainHttpIsRejectedUnlessTheTestOnlySwitchIsOn() throws Exception {
        try (LocalHttpServer origin = LocalHttpServer.start(ex -> ex.sendResponseHeaders(200, -1))) {
            MediaDownloader strict = downloader(props("https://p.example", false, Duration.ofSeconds(5), 3));
            assertThatThrownBy(() -> strict.download("tok", origin.base() + "/photo", ImageVariant.THUMB))
                    .isInstanceOfSatisfying(DownloadException.class,
                            e -> assertThat(e.reason()).isEqualTo("untrusted_host"));
            assertThat(origin.hits()).isEmpty();
        }
    }

    @Test
    void aTricklingBodyHitsTheOverallDownloadDeadline() throws Exception {
        try (LocalHttpServer origin = LocalHttpServer.start(ex -> {
            ex.getResponseHeaders().add("Content-Type", "image/jpeg");
            ex.sendResponseHeaders(200, 90_000);
            try (OutputStream out = ex.getResponseBody()) {
                for (int i = 0; i < 200; i++) {
                    out.write(new byte[100]);
                    out.flush();
                    Thread.sleep(100);
                }
            } catch (IOException | InterruptedException e) {
                // the client gave up
            }
        })) {
            MediaDownloader downloader = downloader(props("https://p.example", true, Duration.ofMillis(500), 3));
            long start = System.nanoTime();
            assertThatThrownBy(() -> downloader.download("tok", origin.base() + "/photo", ImageVariant.FULL))
                    .isInstanceOfSatisfying(DownloadException.class,
                            e -> assertThat(e.reason()).isEqualTo("download_timeout"));
            assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(5));
            assertThat(pauses).isEmpty(); // a timeout is not retried
        }
    }

    @Test
    void aBodyThatStopsSendingIsCutOffByTheDeadline() throws Exception {
        try (LocalHttpServer origin = LocalHttpServer.start(ex -> {
            ex.getResponseHeaders().add("Content-Type", "image/jpeg");
            ex.sendResponseHeaders(200, 50_000);
            try {
                OutputStream out = ex.getResponseBody();
                out.write(new byte[10]);
                out.flush();
                Thread.sleep(10_000);
            } catch (IOException | InterruptedException e) {
                // the client gave up
            }
        })) {
            MediaDownloader downloader = downloader(props("https://p.example", true, Duration.ofMillis(400), 3));
            long start = System.nanoTime();
            assertThatThrownBy(() -> downloader.download("tok", origin.base() + "/photo", ImageVariant.FULL))
                    .isInstanceOfSatisfying(DownloadException.class,
                            e -> assertThat(e.reason()).isEqualTo("download_timeout"));
            assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(5));
        }
    }

    @Test
    void pickerClientTalksToARealServerAndMapsItsErrors() throws Exception {
        try (LocalHttpServer origin = LocalHttpServer.start(ex -> {
            byte[] body = "{\"id\":\"abc123\",\"mediaItemsSet\":true}".getBytes();
            ex.getResponseHeaders().add("Content-Type", "application/json");
            if (ex.getRequestURI().getPath().endsWith("/forbidden")) {
                ex.sendResponseHeaders(403, -1);
                return;
            }
            ex.sendResponseHeaders(200, body.length);
            ex.getResponseBody().write(body);
        })) {
            PickerClient client = picker(origin.base(), 1);
            assertThat(client.getSession("tok", "abc123").mediaItemsSet()).isTrue();
            assertThatThrownBy(() -> client.getSession("tok", "forbidden"))
                    .isInstanceOf(GoogleApiException.class).hasMessageContaining("403");
        }
    }
}
