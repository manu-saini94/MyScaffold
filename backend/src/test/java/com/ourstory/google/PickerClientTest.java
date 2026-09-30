package com.ourstory.google;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.ExpectedCount.times;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.anything;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.ourstory.TestSupport;
import com.ourstory.common.ApiException;
import com.ourstory.common.GoogleReconnectRequiredException;
import com.ourstory.google.PickerModels.MediaItemsPage;
import com.ourstory.google.PickerModels.PickerSession;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.client.response.MockRestResponseCreators;
import org.springframework.web.client.RestClient;

class PickerClientTest {

    private static final String BASE = "https://photospicker.googleapis.com";

    private MockRestServiceServer server;
    private PickerClient client;
    private final List<Long> pauses = new ArrayList<>();

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        client = new PickerClient(builder.baseUrl(BASE).build(),
                TestSupport.props("./data", "a@b.c", List.of("x"), 1024, 1), pauses::add);
    }

    private PickerClient retrying(MockRestServiceServer[] holder, Retrier.Sleeper sleeper) {
        RestClient.Builder builder = RestClient.builder();
        holder[0] = MockRestServiceServer.bindTo(builder).build();
        return new PickerClient(builder.baseUrl(BASE).build(),
                TestSupport.props("./data", "a@b.c", List.of("x"), 1024, 3), sleeper);
    }

    @Test
    void createsASessionWithBearerAndPickingConfig() {
        server.expect(requestTo(BASE + "/v1/sessions"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Authorization", "Bearer tok"))
                .andExpect(content().json("{\"pickingConfig\":{\"maxItemCount\":\"50\"}}"))
                .andRespond(withSuccess("""
                        {"id":"sess_1","pickerUri":"https://photos.google.com/picker/abc",
                         "pollingConfig":{"pollInterval":"5s","timeoutIn":"600s"},
                         "expireTime":"2026-10-01T00:00:00Z","mediaItemsSet":false,"unknownField":1}
                        """, MediaType.APPLICATION_JSON));
        PickerSession session = client.createSession("tok", 50);
        assertThat(session.id()).isEqualTo("sess_1");
        assertThat(session.pollingConfig().pollInterval()).isEqualTo("5s");
        assertThat(session.mediaItemsSet()).isFalse();
        server.verify();
    }

    @Test
    void createsASessionWithEmptyBodyWhenNoMaxItemCount() {
        server.expect(requestTo(BASE + "/v1/sessions")).andExpect(content().json("{}"))
                .andRespond(withSuccess("{\"id\":\"s\",\"pickerUri\":\"u\"}", MediaType.APPLICATION_JSON));
        assertThat(client.createSession("tok", null).id()).isEqualTo("s");
    }

    @Test
    void getsAndDeletesASession() {
        server.expect(requestTo(BASE + "/v1/sessions/abc123"))
                .andExpect(method(HttpMethod.GET)).andExpect(header("Authorization", "Bearer tok"))
                .andRespond(withSuccess("{\"id\":\"abc123\",\"mediaItemsSet\":true}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(BASE + "/v1/sessions/abc123"))
                .andExpect(method(HttpMethod.DELETE)).andExpect(header("Authorization", "Bearer tok"))
                .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));
        assertThat(client.getSession("tok", "abc123").mediaItemsSet()).isTrue();
        client.deleteSession("tok", "abc123");
        server.verify();
    }

    @Test
    void listsMediaItemsWithPagingParameters() {
        server.expect(requestTo(BASE + "/v1/mediaItems?sessionId=s1&pageSize=100"))
                .andExpect(header("Authorization", "Bearer tok"))
                .andRespond(withSuccess("""
                        {"mediaItems":[{"id":"m1","createTime":"2024-05-01T10:00:00Z","type":"PHOTO",
                          "mediaFile":{"baseUrl":"https://lh3.googleusercontent.com/x","mimeType":"image/jpeg",
                          "filename":"a.jpg","mediaFileMetadata":{"width":4000,"height":3000}}}],
                         "nextPageToken":"p2"}
                        """, MediaType.APPLICATION_JSON));
        server.expect(requestTo(BASE + "/v1/mediaItems?sessionId=s1&pageSize=100&pageToken=p2"))
                .andRespond(withSuccess("{\"mediaItems\":[{\"id\":\"m2\"}]}", MediaType.APPLICATION_JSON));
        var all = client.listAllMediaItems("tok", "s1");
        assertThat(all).extracting(PickerModels.PickedMediaItem::id).containsExactly("m1", "m2");
        assertThat(all.get(0).mediaFile().mediaFileMetadata().width()).isEqualTo(4000);
        assertThat(all.get(0).isVideo()).isFalse();
        server.verify();
    }

    @Test
    void emptyPageEndsListing() {
        server.expect(requestTo(BASE + "/v1/mediaItems?sessionId=s1&pageSize=100"))
                .andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));
        assertThat(client.listAllMediaItems("tok", "s1")).isEmpty();
        MediaItemsPage none = new MediaItemsPage(null, null);
        assertThat(none.mediaItems()).isNull();
    }

    @Test
    void stopsWithAnErrorWhenPagesNeverEnd() {
        server.expect(times(PickerClient.MAX_PAGES), anything())
                .andRespond(withSuccess("{\"mediaItems\":[{\"id\":\"m\"}],\"nextPageToken\":\"more\"}",
                        MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> client.listAllMediaItems("tok", "s1"))
                .isInstanceOf(GoogleApiException.class).hasMessageContaining("more result pages");
        server.verify();
    }

    @Test
    void exactlyMaxPagesWithTheLastOneFinalIsFine() {
        for (int page = 0; page < PickerClient.MAX_PAGES; page++) {
            String next = page == PickerClient.MAX_PAGES - 1 ? "" : ",\"nextPageToken\":\"more\"";
            server.expect(anything()).andRespond(withSuccess(
                    "{\"mediaItems\":[{\"id\":\"m" + page + "\"}]" + next + "}", MediaType.APPLICATION_JSON));
        }
        assertThat(client.listAllMediaItems("tok", "s1")).hasSize(PickerClient.MAX_PAGES);
    }

    @Test
    void detectsVideosByTypeOrMimeType() {
        assertThat(new PickerModels.PickedMediaItem("1", null, "VIDEO", null).isVideo()).isTrue();
        assertThat(new PickerModels.PickedMediaItem("1", null, "PHOTO",
                new PickerModels.MediaFile("u", "video/mp4", "f", null)).isVideo()).isTrue();
        assertThat(new PickerModels.PickedMediaItem("1", null, "PHOTO", null).isVideo()).isFalse();
    }

    @Test
    void onlyUnauthorizedMapsToReconnectRequired() {
        server.expect(requestTo(BASE + "/v1/sessions/abc123")).andRespond(withStatus(HttpStatus.UNAUTHORIZED));
        server.expect(requestTo(BASE + "/v1/sessions/abc123")).andRespond(withStatus(HttpStatus.FORBIDDEN));
        assertThatThrownBy(() -> client.getSession("tok", "abc123"))
                .isInstanceOf(GoogleReconnectRequiredException.class);
        assertThatThrownBy(() -> client.getSession("tok", "abc123"))
                .isInstanceOf(GoogleApiException.class)
                .isNotInstanceOf(GoogleReconnectRequiredException.class)
                .hasMessageContaining("403").hasMessageContaining("Picker API");
    }

    @Test
    void redirectsAreErrorsNotFollowedOrRetried() {
        server.expect(requestTo(BASE + "/v1/sessions/abc123"))
                .andRespond(withStatus(HttpStatus.FOUND).header("Location", "https://evil.example/x"));
        assertThatThrownBy(() -> client.getSession("tok", "abc123"))
                .isInstanceOf(GoogleApiException.class).hasMessageContaining("302");
        assertThat(pauses).isEmpty();
    }

    @Test
    void mapsNotFoundAndServerErrorsWithoutLeakingBodies() {
        server.expect(requestTo(BASE + "/v1/sessions/abc123")).andRespond(withStatus(HttpStatus.NOT_FOUND));
        server.expect(requestTo(BASE + "/v1/sessions/abc123"))
                .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR).body("secret upstream detail"));
        assertThatThrownBy(() -> client.getSession("tok", "abc123"))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.status()).isEqualTo(HttpStatus.NOT_FOUND));
        assertThatThrownBy(() -> client.getSession("tok", "abc123"))
                .isInstanceOf(GoogleApiException.class)
                .hasMessageContaining("500").hasMessageNotContaining("secret");
    }

    @Test
    void mapsNetworkFailuresToBadGateway() {
        server.expect(requestTo(BASE + "/v1/sessions/abc123"))
                .andRespond(MockRestResponseCreators.withException(new IOException("boom")));
        assertThatThrownBy(() -> client.getSession("tok", "abc123"))
                .isInstanceOf(GoogleApiException.class).hasMessageContaining("could not be reached");
    }

    @Test
    void unreadableBodiesAreABadGatewayNotACrash() {
        server.expect(requestTo(BASE + "/v1/sessions/abc123"))
                .andRespond(withSuccess("not json at all", MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> client.getSession("tok", "abc123")).isInstanceOf(GoogleApiException.class);
    }

    @Test
    void retriesRateLimitsServerErrorsAndIoFailuresWithBackoff() {
        MockRestServiceServer[] holder = new MockRestServiceServer[1];
        PickerClient retrying = retrying(holder, pauses::add);
        String url = BASE + "/v1/sessions/abc123";
        holder[0].expect(requestTo(url)).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS));
        holder[0].expect(requestTo(url)).andRespond(MockRestResponseCreators.withException(new IOException("x")));
        holder[0].expect(requestTo(url)).andRespond(withSuccess("{\"id\":\"abc123\"}", MediaType.APPLICATION_JSON));
        assertThat(retrying.getSession("tok", "abc123").id()).isEqualTo("abc123");
        assertThat(pauses).hasSize(2);
        assertThat(pauses.get(0)).isBetween(10L, 20L);
        assertThat(pauses.get(1)).isBetween(20L, 30L);
        holder[0].verify();
    }

    @Test
    void givesUpAfterMaxAttemptsWithABadGateway() {
        MockRestServiceServer[] holder = new MockRestServiceServer[1];
        PickerClient retrying = retrying(holder, pauses::add);
        holder[0].expect(times(3), requestTo(BASE + "/v1/sessions/abc123"))
                .andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));
        assertThatThrownBy(() -> retrying.getSession("tok", "abc123"))
                .isInstanceOf(GoogleApiException.class).hasMessageContaining("503");
        assertThat(pauses).hasSize(2);
    }

    @Test
    void interruptedBackoffStopsTheCall() {
        MockRestServiceServer[] holder = new MockRestServiceServer[1];
        PickerClient interrupted = retrying(holder, ms -> {
            throw new InterruptedException();
        });
        holder[0].expect(requestTo(BASE + "/v1/sessions/abc123")).andRespond(withStatus(HttpStatus.BAD_GATEWAY));
        assertThatThrownBy(() -> interrupted.getSession("tok", "abc123")).isInstanceOf(GoogleApiException.class);
        assertThat(Thread.interrupted()).isTrue(); // flag was restored; clear it for other tests
    }
}
