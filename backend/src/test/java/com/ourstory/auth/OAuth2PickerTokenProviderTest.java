package com.ourstory.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.ourstory.common.GoogleReconnectRequiredException;
import com.ourstory.common.GoogleUpstreamException;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.ClientAuthorizationException;
import org.springframework.security.oauth2.client.ClientAuthorizationRequiredException;
import org.springframework.security.oauth2.client.OAuth2AuthorizeRequest;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClientManager;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.core.OAuth2AccessToken;
import org.springframework.security.oauth2.core.OAuth2Error;

class OAuth2PickerTokenProviderTest {

    private final Authentication principal = new TestingAuthenticationToken("sub-1", "n/a");

    @SuppressWarnings("unchecked")
    private OAuth2PickerTokenProvider provider(OAuth2AuthorizedClientManager manager) {
        ObjectProvider<OAuth2AuthorizedClientManager> managers = mock(ObjectProvider.class);
        when(managers.getIfAvailable()).thenReturn(manager);
        return new OAuth2PickerTokenProvider(managers);
    }

    private OAuth2AuthorizedClient client() {
        ClientRegistration reg = ClientRegistration.withRegistrationId("google-picker").clientId("c")
                .authorizationGrantType(org.springframework.security.oauth2.core.AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri("http://x").authorizationUri("http://a").tokenUri("http://t").build();
        OAuth2AccessToken token = new OAuth2AccessToken(OAuth2AccessToken.TokenType.BEARER, "tok-123",
                Instant.now(), Instant.now().plusSeconds(3600));
        return new OAuth2AuthorizedClient(reg, "sub-1", token);
    }

    @Test
    void returnsTheAccessTokenAndAsksForThePickerRegistration() {
        OAuth2AuthorizedClientManager manager = mock(OAuth2AuthorizedClientManager.class);
        when(manager.authorize(any(OAuth2AuthorizeRequest.class))).thenAnswer(inv -> {
            OAuth2AuthorizeRequest request = inv.getArgument(0);
            assertThat(request.getClientRegistrationId()).isEqualTo("google-picker");
            return client();
        });
        OAuth2PickerTokenProvider provider = provider(manager);
        assertThat(provider.accessToken(principal)).isEqualTo("tok-123");
        assertThat(provider.isConnected(principal)).isTrue();
    }

    @Test
    void reportsReconnectWhenNeverAuthorized() {
        OAuth2AuthorizedClientManager manager = mock(OAuth2AuthorizedClientManager.class);
        when(manager.authorize(any())).thenThrow(new ClientAuthorizationRequiredException("google-picker"));
        OAuth2PickerTokenProvider provider = provider(manager);
        assertThatThrownBy(() -> provider.accessToken(principal)).isInstanceOf(GoogleReconnectRequiredException.class);
        assertThat(provider.isConnected(principal)).isFalse();
    }

    @Test
    void reportsReconnectOnInvalidGrant() {
        OAuth2AuthorizedClientManager manager = mock(OAuth2AuthorizedClientManager.class);
        when(manager.authorize(any())).thenThrow(
                new ClientAuthorizationException(new OAuth2Error("invalid_grant"), "google-picker"));
        assertThatThrownBy(() -> provider(manager).accessToken(principal))
                .isInstanceOf(GoogleReconnectRequiredException.class)
                .hasNoCause();
    }

    @Test
    void reportsReconnectWhenManagerReturnsNullOrIsMissingOrNoPrincipal() {
        OAuth2AuthorizedClientManager manager = mock(OAuth2AuthorizedClientManager.class);
        when(manager.authorize(any())).thenReturn(null);
        assertThatThrownBy(() -> provider(manager).accessToken(principal))
                .isInstanceOf(GoogleReconnectRequiredException.class);
        assertThatThrownBy(() -> provider(null).accessToken(principal))
                .isInstanceOf(GoogleReconnectRequiredException.class);
        assertThatThrownBy(() -> provider(manager).accessToken(null))
                .isInstanceOf(GoogleReconnectRequiredException.class);
    }

    @Test
    void invalidTokenAlsoMeansReconnect() {
        OAuth2AuthorizedClientManager manager = mock(OAuth2AuthorizedClientManager.class);
        when(manager.authorize(any())).thenThrow(
                new ClientAuthorizationException(new OAuth2Error("invalid_token"), "google-picker"));
        assertThatThrownBy(() -> provider(manager).accessToken(principal))
                .isInstanceOf(GoogleReconnectRequiredException.class);
    }

    @Test
    void otherRefreshFailuresAreATransientBadGatewayNotAReconnect() {
        for (String code : new String[] {"invalid_token_response", "server_error", "invalid_client",
                "temporarily_unavailable"}) {
            OAuth2AuthorizedClientManager manager = mock(OAuth2AuthorizedClientManager.class);
            when(manager.authorize(any())).thenThrow(new ClientAuthorizationException(
                    new OAuth2Error(code, "secret upstream detail", null), "google-picker",
                    new RuntimeException("boom")));
            OAuth2PickerTokenProvider provider = provider(manager);
            assertThatThrownBy(() -> provider.accessToken(principal))
                    .as(code)
                    .isInstanceOf(GoogleUpstreamException.class)
                    .isNotInstanceOf(GoogleReconnectRequiredException.class)
                    .hasMessageNotContaining("secret").hasNoCause();
            // A transient failure must not tell the UI to send the user through consent again.
            assertThat(provider.isConnected(principal)).as(code).isTrue();
        }
    }
}
