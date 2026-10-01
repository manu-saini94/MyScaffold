package com.ourstory.auth;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpRequest.BodyPublishers;
import java.net.http.HttpResponse;
import java.net.http.HttpResponse.BodyHandlers;
import java.nio.charset.StandardCharsets;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Real Tomcat with the shipped prod YAML: sends unlock attempts with chosen X-Forwarded-For values. */
abstract class ForwardedHeaderTestBase {

    protected static final String SECRET = "Zk3Qv9Lm2Xr7Ty4Wp8Hc1Nb6Jd5Fg0SaEuIoKlMq";

    @LocalServerPort int port;

    private final HttpClient http = HttpClient.newHttpClient();

    private String xsrf() throws Exception {
        HttpResponse<String> response = http.send(
                HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/auth/status")).build(),
                BodyHandlers.ofString());
        return response.headers().allValues("Set-Cookie").stream().filter(c -> c.startsWith("XSRF-TOKEN="))
                .map(c -> c.substring("XSRF-TOKEN=".length(), c.indexOf(';'))).findFirst().orElseThrow();
    }

    /** One WRONG unlock attempt carrying the given X-Forwarded-For header; returns the HTTP status. */
    protected int wrongAttempt(String forwardedFor) throws Exception {
        String token = xsrf();
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/auth/unlock"))
                .header("Content-Type", "application/json")
                .header("Cookie", "XSRF-TOKEN=" + token).header("X-XSRF-TOKEN", token)
                .POST(BodyPublishers.ofString("{\"answer\":\"definitely wrong\"}", StandardCharsets.UTF_8));
        if (forwardedFor != null) {
            builder.header("X-Forwarded-For", forwardedFor);
        }
        return http.send(builder.build(), BodyHandlers.ofString()).statusCode();
    }
}
