package com.ourstory.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpRequest.BodyPublishers;
import java.net.http.HttpResponse;
import java.net.http.HttpResponse.BodyHandlers;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;

/**
 * A real Tomcat on a random port: chunked bodies (no Content-Length) over the limits must be cut off by the byte
 * counting wrapper and answered with a 413 ProblemDetail.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:h2:mem:ourstory-real-server;DB_CLOSE_DELAY=-1",
        "ourstory.viewer.unlock-question=Test question?",
        "ourstory.viewer.unlock-answers=Sample",
        "ourstory.viewer-cookie-secret=" + ViewerTestSupport.SECRET})
@ActiveProfiles("test")
class RealServerTest {

    @LocalServerPort int port;

    private final HttpClient http = HttpClient.newHttpClient();

    private String xsrf() throws Exception {
        HttpResponse<String> response = http.send(HttpRequest.newBuilder(uri("/api/auth/status")).build(),
                BodyHandlers.ofString());
        return response.headers().allValues("Set-Cookie").stream().filter(c -> c.startsWith("XSRF-TOKEN="))
                .map(c -> c.substring("XSRF-TOKEN=".length(), c.indexOf(';'))).findFirst().orElseThrow();
    }

    private URI uri(String path) {
        return URI.create("http://localhost:" + port + path);
    }

    /** POST with an UNKNOWN length body, so the client uses chunked transfer encoding. */
    private HttpResponse<String> chunkedPost(String path, byte[] body) throws Exception {
        String token = xsrf();
        HttpRequest request = HttpRequest.newBuilder(uri(path))
                .header("Content-Type", "application/json")
                .header("Cookie", "XSRF-TOKEN=" + token).header("X-XSRF-TOKEN", token)
                .POST(BodyPublishers.ofInputStream(() -> new ByteArrayInputStream(body))).build();
        return http.send(request, BodyHandlers.ofString());
    }

    private static byte[] unlockJson(String answer) {
        return ("{\"answer\":\"" + answer + "\"}").getBytes(StandardCharsets.UTF_8);
    }

    @Test
    void aChunkedUnlockBodyOverTheLimitGets413WithAProblemBody() throws Exception {
        HttpResponse<String> response = chunkedPost("/api/auth/unlock", unlockJson("a".repeat(20_000)));
        assertThat(response.statusCode()).isEqualTo(413);
        assertThat(response.headers().firstValue("Content-Type").orElse("")).startsWith("application/problem+json");
        assertThat(response.body()).contains("urn:ourstory:problem:payload-too-large").contains("\"status\":413");
    }

    @Test
    void aSmallChunkedUnlockBodyStillWorks() throws Exception {
        HttpResponse<String> wrong = chunkedPost("/api/auth/unlock", unlockJson("not-it-at-all"));
        assertThat(wrong.statusCode()).isEqualTo(401);
        HttpResponse<String> right = chunkedPost("/api/auth/unlock", unlockJson("Sample"));
        assertThat(right.statusCode()).isEqualTo(204);
        assertThat(right.headers().allValues("Set-Cookie")).anyMatch(c -> c.startsWith("os_viewer="));
    }

    @Test
    void aChunkedBodyJustAtTheLimitPassesTheFilter() throws Exception {
        // exactly 4096 bytes of JSON: the filter lets it through (the answer is then rejected as too long: 400)
        String prefix = "{\"answer\":\"";
        String suffix = "\"}";
        int fill = (int) com.ourstory.common.BodyLimitFilter.AUTH_LIMIT_BYTES - prefix.length() - suffix.length();
        byte[] body = (prefix + "a".repeat(fill) + suffix).getBytes(StandardCharsets.UTF_8);
        assertThat(body).hasSize(4096);
        assertThat(chunkedPost("/api/auth/unlock", body).statusCode()).isEqualTo(400);
        byte[] over = (prefix + "a".repeat(fill + 1) + suffix).getBytes(StandardCharsets.UTF_8);
        assertThat(chunkedPost("/api/auth/unlock", over).statusCode()).isEqualTo(413);
    }
}
