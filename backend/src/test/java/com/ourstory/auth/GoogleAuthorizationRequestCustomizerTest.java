package com.ourstory.auth;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import org.springframework.security.oauth2.core.endpoint.OAuth2ParameterNames;

class GoogleAuthorizationRequestCustomizerTest {

    private static OAuth2AuthorizationRequest build(String registrationId) {
        OAuth2AuthorizationRequest.Builder builder = OAuth2AuthorizationRequest.authorizationCode()
                .authorizationUri("https://accounts.google.com/o/oauth2/v2/auth")
                .clientId("cid")
                .attributes(a -> a.put(OAuth2ParameterNames.REGISTRATION_ID, registrationId));
        new GoogleAuthorizationRequestCustomizer().accept(builder);
        return builder.build();
    }

    @Test
    void pickerRegistrationGetsOfflineIncrementalAndConsent() {
        assertThat(build("google-picker").getAdditionalParameters())
                .containsEntry("access_type", "offline")
                .containsEntry("include_granted_scopes", "true")
                .containsEntry("prompt", "consent");
    }

    @Test
    void plainLoginIsUntouched() {
        assertThat(build("google").getAdditionalParameters()).isEmpty();
    }
}
