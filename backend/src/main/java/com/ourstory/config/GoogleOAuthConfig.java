package com.ourstory.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.oauth2.client.CommonOAuth2Provider;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;

/** Registers the Google OAuth2 client only when GOOGLE_CLIENT_ID is set, so the app starts without it. */
@Configuration(proxyBeanMethods = false)
@ConditionalOnExpression("!'${ourstory.google.client-id:}'.isBlank()")
class GoogleOAuthConfig {

    @Bean
    ClientRegistrationRepository clientRegistrationRepository(OurStoryProperties props) {
        // Login requests identity scopes only.
        // TODO(Phase 3): request the Photos Picker scope incrementally, when the admin starts a picker session.
        ClientRegistration google = CommonOAuth2Provider.GOOGLE.getBuilder("google")
                .clientId(props.google().clientId())
                .clientSecret(props.google().clientSecret())
                .scope("openid", "email", "profile")
                .build();
        return new InMemoryClientRegistrationRepository(google);
    }
}
