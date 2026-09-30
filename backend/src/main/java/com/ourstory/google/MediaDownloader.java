package com.ourstory.google;

import com.ourstory.config.OurStoryProperties;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Downloads image bytes from a Picker baseUrl. Sends the Bearer token, only talks to allow-listed https
 * hosts, never follows redirects (a 3xx is the failure "http_3xx"), requires an image Content-Type, bounds
 * the body size and the total time spent reading it, and retries 429/5xx/IO errors with exponential
 * backoff plus jitter. baseUrls and tokens are never logged or put into exception messages.
 */
@Component
public class MediaDownloader {

    /** The 32px placeholder is tiny; anything bigger is not what we asked for. */
    static final long LQIP_MAX_BYTES = 16 * 1024;

    private final RestClient rest;
    private final List<String> allowedHosts;
    private final boolean allowInsecureHttp;
    private final long maxBytes;
    private final Duration downloadTimeout;
    private final Retrier retrier;

    @Autowired
    public MediaDownloader(RestClient.Builder builder, OurStoryProperties props) {
        this(GoogleHttpClients.noRedirect(builder).build(), props, Thread::sleep);
    }

    MediaDownloader(RestClient rest, OurStoryProperties props, Retrier.Sleeper sleeper) {
        this.rest = rest;
        this.allowedHosts = props.google().allowedMediaHosts();
        this.allowInsecureHttp = props.google().allowInsecureHttp();
        this.maxBytes = props.importJob().maxDownloadBytes();
        this.downloadTimeout = props.importJob().downloadTimeout();
        this.retrier = new Retrier(props.importJob().maxAttempts(), props.importJob().backoffBaseMillis(), sleeper);
    }

    public record DownloadedImage(byte[] bytes, String contentType) {
    }

    public DownloadedImage download(String accessToken, String baseUrl, ImageVariant variant) {
        URI uri = checkedUri(baseUrl, variant);
        long limit = variant == ImageVariant.LQIP ? Math.min(maxBytes, LQIP_MAX_BYTES) : maxBytes;
        return retrier.run(() -> attemptOnce(accessToken, uri, limit),
                failure -> new DownloadException(failure.reason() + "_retries_exhausted", false),
                () -> new DownloadException("interrupted", false));
    }

    private URI checkedUri(String baseUrl, ImageVariant variant) {
        URI uri;
        try {
            uri = new URI(baseUrl + variant.suffix());
        } catch (Exception e) {
            throw new DownloadException("invalid_base_url", false);
        }
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        boolean schemeOk = "https".equalsIgnoreCase(uri.getScheme())
                || (allowInsecureHttp && "http".equalsIgnoreCase(uri.getScheme()));
        boolean allowed = schemeOk && allowedHosts.stream()
                .anyMatch(suffix -> host.equals(suffix) || host.endsWith("." + suffix));
        if (!allowed) {
            throw new DownloadException("untrusted_host", false);
        }
        return uri;
    }

    private DownloadedImage attemptOnce(String accessToken, URI uri, long limit) {
        try {
            return rest.get().uri(uri)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken)
                    .exchange((request, response) -> {
                        int status = response.getStatusCode().value();
                        if (status == 429 || status >= 500) {
                            throw new Retrier.TransientFailure("http_" + status, status);
                        }
                        if (status == 401) {
                            throw new DownloadException("unauthorized", true);
                        }
                        if (status >= 300 && status < 400) {
                            throw new DownloadException("http_3xx", false); // redirects are never followed
                        }
                        if (status < 200 || status >= 300) {
                            throw new DownloadException("http_" + status, false);
                        }
                        MediaType type = response.getHeaders().getContentType();
                        if (type == null || !"image".equalsIgnoreCase(type.getType())) {
                            throw new DownloadException("not_an_image", false);
                        }
                        return new DownloadedImage(readBounded(response.getBody(), limit),
                                type.getType() + "/" + type.getSubtype());
                    });
        } catch (ResourceAccessException e) {
            throw new Retrier.TransientFailure("io_error", 0);
        } catch (RestClientException e) {
            throw new DownloadException("request_failed", false);
        }
    }

    /**
     * Reads at most {@code limit} bytes within the download deadline. A watchdog closes the stream when the
     * deadline passes, so a server that sends nothing (or trickles bytes) cannot hold the worker.
     */
    private byte[] readBounded(InputStream in, long limit) throws IOException {
        AtomicBoolean timedOut = new AtomicBoolean();
        Thread watchdog = Thread.startVirtualThread(() -> {
            try {
                Thread.sleep(downloadTimeout);
                timedOut.set(true);
                in.close();
            } catch (InterruptedException e) {
                // finished in time
            } catch (IOException e) {
                // already closed
            }
        });
        try {
            return readAll(in, limit, timedOut);
        } catch (IOException e) {
            if (timedOut.get()) {
                throw new DownloadException("download_timeout", false);
            }
            throw e;
        } finally {
            watchdog.interrupt();
        }
    }

    private static byte[] readAll(InputStream in, long limit, AtomicBoolean timedOut) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        long total = 0;
        int read;
        while ((read = in.read(buffer)) != -1) {
            total += read;
            if (total > limit) {
                throw new DownloadException("too_large", false);
            }
            out.write(buffer, 0, read);
            if (timedOut.get()) {
                throw new DownloadException("download_timeout", false);
            }
        }
        if (timedOut.get()) {
            throw new DownloadException("download_timeout", false);
        }
        return out.toByteArray();
    }
}
