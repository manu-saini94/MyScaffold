package com.ourstory.auth;

import com.ourstory.common.GoogleReconnectRequiredException;
import com.ourstory.common.GoogleUpstreamException;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.ClientAuthorizationException;
import org.springframework.security.oauth2.client.OAuth2AuthorizeRequest;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClientManager;
import org.springframework.stereotype.Component;

/**
 * Token source backed by the in-memory authorized-client service. The manager refreshes expired access
 * tokens. Only errors that really mean "the admin has to consent again" (invalid_grant,
 * client_authorization_required, invalid_token) become the 409 reconnect problem; any other refresh
 * failure (outage, malformed response, ...) is a transient 502 {@link GoogleUpstreamException} so the
 * user is not sent through consent for a Google hiccup.
 */
@Component
public class OAuth2PickerTokenProvider implements PickerTokenProvider {

    private static final Logger log = LoggerFactory.getLogger(OAuth2PickerTokenProvider.class);
    static final Set<String> RECONNECT_ERROR_CODES =
            Set.of("invalid_grant", "client_authorization_required", "invalid_token");

    private final ObjectProvider<OAuth2AuthorizedClientManager> managers;

    public OAuth2PickerTokenProvider(ObjectProvider<OAuth2AuthorizedClientManager> managers) {
        this.managers = managers;
    }

    @Override
    public String accessToken(Authentication principal) {
        OAuth2AuthorizedClientManager manager = managers.getIfAvailable();
        if (manager == null || principal == null) {
            throw new GoogleReconnectRequiredException();
        }
        try {
            OAuth2AuthorizedClient client = manager.authorize(OAuth2AuthorizeRequest
                    .withClientRegistrationId(GoogleAuthorizationRequestCustomizer.PICKER_REGISTRATION_ID)
                    .principal(principal)
                    .build());
            if (client == null || client.getAccessToken() == null) {
                throw new GoogleReconnectRequiredException();
            }
            return client.getAccessToken().getTokenValue();
        } catch (ClientAuthorizationException e) {
            // Deliberately no cause attached: it can carry token endpoint response details.
            String code = e.getError() == null ? "" : e.getError().getErrorCode();
            if (RECONNECT_ERROR_CODES.contains(code)) {
                throw new GoogleReconnectRequiredException();
            }
            log.warn("Google token refresh failed with error code {}", code);
            throw new GoogleUpstreamException("Google could not refresh the Photos access token. Try again shortly.");
        }
    }
}
