package com.ourstory.config;

import com.ourstory.auth.GoogleAuthorizationRequestCustomizer;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.oauth2.client.CommonOAuth2Provider;
import org.springframework.security.oauth2.client.AuthorizedClientServiceOAuth2AuthorizedClientManager;
import org.springframework.security.oauth2.client.InMemoryOAuth2AuthorizedClientService;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClientManager;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClientProviderBuilder;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClientService;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.oauth2.client.web.DefaultOAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestResolver;

/**
 * Google OAuth2 wiring, active only when GOOGLE_CLIENT_ID is set so the app starts without it.
 *
 * <p>Two registrations share one Google client: {@code google} (admin login, identity scopes) and
 * {@code google-picker} (identity + Photos Picker scope, offline access). Tokens live in memory only.
 */
@Configuration(proxyBeanMethods = false)
@ConditionalOnExpression("!'${ourstory.google.client-id:}'.isBlank()")
class GoogleOAuthConfig {

    static final String PICKER_SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";
    private static final String REDIRECT_URI = "{baseUrl}/login/oauth2/code/{registrationId}";

    @Bean
    ClientRegistrationRepository clientRegistrationRepository(OurStoryProperties props) {
        return new InMemoryClientRegistrationRepository(
                registration("google", props, "openid", "email", "profile"),
                registration(GoogleAuthorizationRequestCustomizer.PICKER_REGISTRATION_ID, props,
                        "openid", "email", "profile", PICKER_SCOPE));
    }

    private static ClientRegistration registration(String id, OurStoryProperties props, String... scopes) {
        return CommonOAuth2Provider.GOOGLE.getBuilder(id)
                .clientId(props.google().clientId())
                .clientSecret(props.google().clientSecret())
                .redirectUri(REDIRECT_URI)
                .scope(scopes)
                .build();
    }

    @Bean
    OAuth2AuthorizationRequestResolver googleAuthorizationRequestResolver(ClientRegistrationRepository repository) {
        DefaultOAuth2AuthorizationRequestResolver resolver =
                new DefaultOAuth2AuthorizationRequestResolver(repository, "/oauth2/authorization");
        resolver.setAuthorizationRequestCustomizer(new GoogleAuthorizationRequestCustomizer());
        return resolver;
    }

    /**
     * DECISION: tokens are kept in memory only and never written to disk. A restart means reconnecting
     * Google Photos, which Testing-mode refresh tokens (7 days) already require weekly.
     */
    @Bean
    OAuth2AuthorizedClientService authorizedClientService(ClientRegistrationRepository repository) {
        return new InMemoryOAuth2AuthorizedClientService(repository);
    }

    /** Service-based manager: works outside a request (import job) and refreshes expired access tokens. */
    @Bean
    OAuth2AuthorizedClientManager authorizedClientManager(ClientRegistrationRepository repository,
            OAuth2AuthorizedClientService service) {
        AuthorizedClientServiceOAuth2AuthorizedClientManager manager =
                new AuthorizedClientServiceOAuth2AuthorizedClientManager(repository, service);
        manager.setAuthorizedClientProvider(
                OAuth2AuthorizedClientProviderBuilder.builder().authorizationCode().refreshToken().build());
        return manager;
    }
}
