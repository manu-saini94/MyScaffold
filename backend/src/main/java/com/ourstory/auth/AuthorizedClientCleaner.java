package com.ourstory.auth;

import java.util.List;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClientService;
import org.springframework.stereotype.Component;

/**
 * Removes the stored Google tokens ("google" and "google-picker" authorized clients) of a principal, so
 * tokens never outlive the session that obtained them (logout) or exist for a non-admin at all.
 */
@Component
public class AuthorizedClientCleaner {

    static final List<String> REGISTRATION_IDS = List.of("google", GoogleAuthorizationRequestCustomizer.PICKER_REGISTRATION_ID);

    private final ObjectProvider<OAuth2AuthorizedClientService> services;

    public AuthorizedClientCleaner(ObjectProvider<OAuth2AuthorizedClientService> services) {
        this.services = services;
    }

    public void removeFor(Authentication principal) {
        OAuth2AuthorizedClientService service = services.getIfAvailable();
        if (service == null || principal == null || principal.getName() == null) {
            return;
        }
        for (String registrationId : REGISTRATION_IDS) {
            service.removeAuthorizedClient(registrationId, principal.getName());
        }
    }
}
