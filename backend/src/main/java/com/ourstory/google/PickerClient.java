package com.ourstory.google;

import com.ourstory.common.ApiException;
import com.ourstory.common.GoogleReconnectRequiredException;
import com.ourstory.config.OurStoryProperties;
import com.ourstory.google.PickerModels.MediaItemsPage;
import com.ourstory.google.PickerModels.PickedMediaItem;
import com.ourstory.google.PickerModels.PickerSession;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Thin client for https://photospicker.googleapis.com/v1 (sessions and mediaItems). Tokens are passed per
 * call and never logged; Google error bodies are never propagated. Redirects are never followed (3xx is an
 * error), and 429/5xx/IO failures are retried with backoff. Only 401 means "reconnect"; a 403 (for example
 * the Picker API not being enabled) is a distinct google-api-error.
 */
@Component
public class PickerClient {

    static final int PAGE_SIZE = 100;
    /** Google caps a session at 2000 items (20 pages of 100); this is a runaway-loop guard. */
    static final int MAX_PAGES = 30;

    private final RestClient rest;
    private final Retrier retrier;

    @Autowired
    public PickerClient(RestClient.Builder builder, OurStoryProperties props) {
        this(GoogleHttpClients.noRedirect(builder).baseUrl(props.google().pickerBaseUrl()).build(), props,
                Thread::sleep);
    }

    PickerClient(RestClient rest, OurStoryProperties props, Retrier.Sleeper sleeper) {
        this.rest = rest;
        this.retrier = new Retrier(props.importJob().maxAttempts(), props.importJob().backoffBaseMillis(), sleeper);
    }

    public PickerSession createSession(String token, Integer maxItemCount) {
        // int64 fields are JSON strings in Google's API.
        Map<String, Object> body = maxItemCount == null
                ? Map.of()
                : Map.of("pickingConfig", Map.of("maxItemCount", String.valueOf(maxItemCount)));
        return send(() -> rest.post().uri("/v1/sessions")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body), PickerSession.class);
    }

    public PickerSession getSession(String token, String sessionId) {
        return send(() -> rest.get().uri("/v1/sessions/{id}", sessionId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token), PickerSession.class);
    }

    public void deleteSession(String token, String sessionId) {
        send(() -> rest.delete().uri("/v1/sessions/{id}", sessionId)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token), Void.class);
    }

    public MediaItemsPage listMediaItems(String token, String sessionId, String pageToken) {
        return send(() -> rest.get()
                .uri(b -> {
                    b.path("/v1/mediaItems").queryParam("sessionId", sessionId).queryParam("pageSize", PAGE_SIZE);
                    if (pageToken != null) {
                        b.queryParam("pageToken", pageToken);
                    }
                    return b.build();
                })
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token), MediaItemsPage.class);
    }

    /**
     * Follows nextPageToken until exhausted.
     *
     * @throws GoogleApiException when Google still offers more pages after {@link #MAX_PAGES}: importing a
     *         silently truncated selection would be worse than failing
     */
    public List<PickedMediaItem> listAllMediaItems(String token, String sessionId) {
        List<PickedMediaItem> all = new ArrayList<>();
        String pageToken = null;
        for (int page = 0; page < MAX_PAGES; page++) {
            MediaItemsPage result = listMediaItems(token, sessionId, pageToken);
            if (result != null && result.mediaItems() != null) {
                all.addAll(result.mediaItems());
            }
            pageToken = result == null ? null : result.nextPageToken();
            if (pageToken == null || pageToken.isBlank()) {
                return all;
            }
        }
        throw new GoogleApiException("Google returned more result pages than expected; import aborted.");
    }

    private <T> T send(Supplier<RestClient.RequestHeadersSpec<?>> request, Class<T> type) {
        return retrier.run(() -> attempt(request.get(), type),
                failure -> new GoogleApiException(failure.status()),
                () -> new GoogleApiException(0));
    }

    private <T> T attempt(RestClient.RequestHeadersSpec<?> spec, Class<T> type) {
        try {
            return spec.exchange((request, response) -> {
                int status = response.getStatusCode().value();
                if (status == 429 || status >= 500) {
                    throw new Retrier.TransientFailure("http_" + status, status);
                }
                if (status == 401) {
                    throw new GoogleReconnectRequiredException();
                }
                if (status == 404) {
                    throw ApiException.notFound("Picker session");
                }
                if (status < 200 || status >= 300) {
                    throw new GoogleApiException(status); // includes 403 and never-followed 3xx
                }
                return type == Void.class ? null : response.bodyTo(type);
            });
        } catch (ResourceAccessException e) {
            throw new Retrier.TransientFailure("io_error", 0);
        } catch (RestClientException e) {
            throw new GoogleApiException(0);
        }
    }
}
