package com.ourstory.google;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.ourstory.auth.PickerTokenProvider;
import com.ourstory.common.ApiException;
import com.ourstory.google.PickerModels.PickerSession;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.TestingAuthenticationToken;

/** The admin's browser is sent to pickerUri, so it must be https on google.com (or a subdomain). */
class PickerSessionUriTest {

    private final PickerClient client = mock(PickerClient.class);
    private final PickerTokenProvider tokens = mock(PickerTokenProvider.class);
    private final PickerSessionService service = new PickerSessionService(client, tokens);

    private String create(String pickerUri) {
        when(tokens.accessToken(any())).thenReturn("tok");
        when(client.createSession(any(), any())).thenReturn(new PickerSession("sess_abc123", pickerUri, null, null,
                false));
        return service.create(new TestingAuthenticationToken("me", "n/a"), null).pickerUri();
    }

    @Test
    void acceptsHttpsGoogleComAndSubdomains() {
        assertThat(create("https://photos.google.com/picker/abc")).isEqualTo("https://photos.google.com/picker/abc/autoclose");
        assertThat(create("https://google.com/picker/abc")).endsWith("/autoclose");
        assertThat(create("https://PHOTOS.GOOGLE.COM/picker/abc")).endsWith("/autoclose");
    }

    @Test
    void rejectsEverythingElseWithABadGateway() {
        for (String bad : new String[] {"http://photos.google.com/picker/abc", "https://evil.example/picker/abc",
                "https://google.com.evil.io/picker", "https://notgoogle.com/x", "javascript:alert(1)",
                "https://evil.example/https://photos.google.com/", "https://photos.google.com@evil.example/x",
                "//photos.google.com/x", "not a uri at all", ""}) {
            assertThatThrownBy(() -> create(bad)).as(bad).isInstanceOfSatisfying(ApiException.class,
                    e -> assertThat(e.status()).isEqualTo(HttpStatus.BAD_GATEWAY));
        }
    }
}
