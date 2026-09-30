package com.ourstory.auth;

import java.util.function.Consumer;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import org.springframework.security.oauth2.core.endpoint.OAuth2ParameterNames;

/**
 * Adds Google-specific parameters to the authorization request of the "google-picker" registration only:
 * offline access (refresh token), incremental scopes, and forced consent. Plain admin login is untouched.
 */
public class GoogleAuthorizationRequestCustomizer implements Consumer<OAuth2AuthorizationRequest.Builder> {

    public static final String PICKER_REGISTRATION_ID = "google-picker";

    @Override
    public void accept(OAuth2AuthorizationRequest.Builder builder) {
        builder.attributes(attributes -> {
            if (PICKER_REGISTRATION_ID.equals(attributes.get(OAuth2ParameterNames.REGISTRATION_ID))) {
                builder.additionalParameters(params -> {
                    params.put("access_type", "offline");
                    params.put("include_granted_scopes", "true");
                    params.put("prompt", "consent");
                });
            }
        });
    }
}
