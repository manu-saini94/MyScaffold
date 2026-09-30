package com.ourstory.google;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.ourstory.auth.PickerTokenProvider;
import com.ourstory.common.ApiException;
import com.ourstory.google.PickerModels.PickerSession;
import com.ourstory.google.PickerModels.PollingConfig;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.Authentication;

class PickerSessionServiceTest {

    private final PickerClient client = mock(PickerClient.class);
    private final PickerTokenProvider tokens = mock(PickerTokenProvider.class);
    private final PickerSessionService service = new PickerSessionService(client, tokens);
    private final Authentication auth = new TestingAuthenticationToken("sub", "x");

    @Test
    void appendsAutocloseAndNormalisesPolling() {
        when(tokens.accessToken(auth)).thenReturn("tok");
        when(client.createSession("tok", null)).thenReturn(new PickerSession("sess-1",
                "https://photos.google.com/picker/abc", new PollingConfig("5s", "600s"), "2026-10-01T00:00:00Z", false));
        var created = service.create(auth, null);
        assertThat(created.sessionId()).isEqualTo("sess-1");
        assertThat(created.pickerUri()).isEqualTo("https://photos.google.com/picker/abc/autoclose");
        assertThat(created.pollingConfig().pollIntervalMs()).isEqualTo(5000);
        assertThat(created.pollingConfig().timeoutMs()).isEqualTo(600_000L);
    }

    @Test
    void doesNotDoubleAppendAutoclose() {
        assertThat(PickerSessionService.autoclose("https://p/x/autoclose")).isEqualTo("https://p/x/autoclose");
        assertThat(PickerSessionService.autoclose("https://p/x/")).isEqualTo("https://p/x/autoclose");
    }

    @Test
    void parsesDurationsDefensively() {
        assertThat(PickerSessionService.parseMillis("0.5s")).isEqualTo(500L);
        assertThat(PickerSessionService.parseMillis("0s")).isEqualTo(0L);
        assertThat(PickerSessionService.parseMillis("abc")).isNull();
        assertThat(PickerSessionService.parseMillis("xs")).isNull();
        assertThat(PickerSessionService.parseMillis(null)).isNull();
    }

    @Test
    void statusHasNoPollingConfigOnceItemsAreSet() {
        when(tokens.accessToken(auth)).thenReturn("tok");
        when(client.getSession("tok", "sess-1")).thenReturn(new PickerSession("sess-1", null, null, "exp", true));
        var status = service.status(auth, "sess-1");
        assertThat(status.mediaItemsSet()).isTrue();
        assertThat(status.pollingConfig()).isNull();
        assertThat(status.expireTime()).isEqualTo("exp");
    }

    @Test
    void fallsBackToDefaultPollIntervalWhenMissing() {
        when(tokens.accessToken(auth)).thenReturn("tok");
        when(client.getSession(eq("tok"), any())).thenReturn(
                new PickerSession("sess-1", null, new PollingConfig("garbage", null), null, false));
        var polling = service.status(auth, "sess-1").pollingConfig();
        assertThat(polling.pollIntervalMs()).isEqualTo(5000);
        assertThat(polling.timeoutMs()).isNull();
    }

    @Test
    void validatesInput() {
        assertThatThrownBy(() -> service.status(auth, "../etc")).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> service.status(auth, "a b")).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> service.status(auth, null)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> service.create(auth, 0)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> service.create(auth, 2001)).isInstanceOf(ApiException.class);
    }

    @Test
    void rejectsMalformedGoogleResponses() {
        when(tokens.accessToken(auth)).thenReturn("tok");
        when(client.createSession("tok", null)).thenReturn(new PickerSession(null, null, null, null, false));
        when(client.getSession("tok", "sess-1")).thenReturn(null);
        assertThatThrownBy(() -> service.create(auth, null)).isInstanceOf(GoogleApiException.class);
        assertThatThrownBy(() -> service.status(auth, "sess-1")).isInstanceOf(GoogleApiException.class);
    }
}
