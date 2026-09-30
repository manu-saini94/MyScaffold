package com.ourstory.google;

import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * RestClients that carry a Google bearer token. They NEVER follow redirects: a 3xx could otherwise send
 * the Authorization header (or the request) to a host that is not on the allow-list. A 3xx is treated as a
 * failure by the callers. Built explicitly on the JDK HttpClient so the setting cannot be lost through
 * global HTTP client properties.
 */
final class GoogleHttpClients {

    static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(10);
    static final Duration READ_TIMEOUT = Duration.ofSeconds(60);

    private GoogleHttpClients() {
    }

    static RestClient.Builder noRedirect(RestClient.Builder base) {
        HttpClient http = HttpClient.newBuilder()
                .followRedirects(HttpClient.Redirect.NEVER)
                .connectTimeout(CONNECT_TIMEOUT)
                .build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(http);
        factory.setReadTimeout(READ_TIMEOUT);
        return base.clone().requestFactory(factory);
    }
}
