package com.ourstory.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.client.InMemoryOAuth2AuthorizedClientService;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClientService;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.OAuth2AccessToken;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;

class AdminLoginHandlersTest {

    private OAuth2AuthorizedClientService service;
    private AuthorizedClientCleaner cleaner;
    private ClientRegistration google;
    private ClientRegistration picker;

    private static ClientRegistration registration(String id) {
        return ClientRegistration.withRegistrationId(id).clientId("c")
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                .redirectUri("http://x").authorizationUri("http://a").tokenUri("http://t").build();
    }

    @SuppressWarnings("unchecked")
    @BeforeEach
    void setUp() {
        google = registration("google");
        picker = registration("google-picker");
        service = new InMemoryOAuth2AuthorizedClientService(new InMemoryClientRegistrationRepository(google, picker));
        ObjectProvider<OAuth2AuthorizedClientService> provider = org.mockito.Mockito.mock(ObjectProvider.class);
        org.mockito.Mockito.when(provider.getIfAvailable()).thenReturn(service);
        cleaner = new AuthorizedClientCleaner(provider);
        SecurityContextHolder.clearContext();
    }

    private void storeTokensFor(String name) {
        OAuth2AccessToken token = new OAuth2AccessToken(OAuth2AccessToken.TokenType.BEARER, "t", Instant.now(),
                Instant.now().plusSeconds(60));
        Authentication principal = new TestingAuthenticationToken(name, "n/a");
        service.saveAuthorizedClient(new OAuth2AuthorizedClient(google, name, token), principal);
        service.saveAuthorizedClient(new OAuth2AuthorizedClient(picker, name, token), principal);
    }

    private boolean hasTokens(String name) {
        return service.loadAuthorizedClient("google", name) != null
                || service.loadAuthorizedClient("google-picker", name) != null;
    }

    @Test
    void adminIsRedirectedAndKeepsTheirSessionAndTokens() throws Exception {
        storeTokensFor("admin-sub");
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpSession session = new MockHttpSession();
        request.setSession(session);
        MockHttpServletResponse response = new MockHttpServletResponse();
        Authentication admin = new TestingAuthenticationToken("admin-sub", "n/a", "ROLE_ADMIN");
        AdminLoginHandlers.success("/admin", cleaner).onAuthenticationSuccess(request, response, admin);
        assertThat(response.getRedirectedUrl()).isEqualTo("/admin");
        assertThat(session.isInvalid()).isFalse();
        assertThat(hasTokens("admin-sub")).isTrue();
    }

    @Test
    void nonAdminIsSignedOutPurgedAndShownA403Page() throws Exception {
        storeTokensFor("stranger-sub");
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpSession session = new MockHttpSession();
        request.setSession(session);
        MockHttpServletResponse response = new MockHttpServletResponse();
        Authentication stranger = new TestingAuthenticationToken("stranger-sub", "n/a", "OIDC_USER");
        SecurityContextHolder.getContext().setAuthentication(stranger);

        AdminLoginHandlers.success("/admin", cleaner).onAuthenticationSuccess(request, response, stranger);

        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(response.getRedirectedUrl()).isNull();
        assertThat(response.getContentType()).startsWith("text/html");
        assertThat(response.getContentAsString()).contains("Not authorised").doesNotContain("<script");
        assertThat(session.isInvalid()).isTrue();
        assertThat(hasTokens("stranger-sub")).isFalse();
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    void nonAdminWithoutASessionIsStillPurged() throws Exception {
        storeTokensFor("stranger-sub");
        MockHttpServletResponse response = new MockHttpServletResponse();
        Authentication stranger = new TestingAuthenticationToken("stranger-sub", "n/a");
        AdminLoginHandlers.success("/x", cleaner).onAuthenticationSuccess(new MockHttpServletRequest(), response,
                stranger);
        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(hasTokens("stranger-sub")).isFalse();
    }

    @Test
    void failedLoginsAnswer401WithoutDetails() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        AdminLoginHandlers.failure().onAuthenticationFailure(new MockHttpServletRequest(), response,
                new OAuth2AuthenticationException(new OAuth2Error("access_denied", "secret detail", null)));
        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(response.getContentAsString()).contains("Sign-in failed").doesNotContain("secret detail");
    }

    @Test
    void cleanerAndLogoutHandlerRemoveBothRegistrationsAndTolerateNothingToDo() {
        storeTokensFor("u1");
        storeTokensFor("u2");
        new ClientCleanupLogoutHandler(cleaner).logout(new MockHttpServletRequest(), new MockHttpServletResponse(),
                new TestingAuthenticationToken("u1", "n/a"));
        assertThat(hasTokens("u1")).isFalse();
        assertThat(hasTokens("u2")).isTrue();
        cleaner.removeFor(null);
        new ClientCleanupLogoutHandler(cleaner).logout(new MockHttpServletRequest(), new MockHttpServletResponse(),
                null);

        @SuppressWarnings("unchecked")
        ObjectProvider<OAuth2AuthorizedClientService> none = org.mockito.Mockito.mock(ObjectProvider.class);
        new AuthorizedClientCleaner(none).removeFor(new TestingAuthenticationToken("u2", "n/a"));
        assertThat(hasTokens("u2")).isTrue(); // no service configured: nothing happens, no exception
        assertThat(List.of(new SimpleGrantedAuthority("x"))).hasSize(1);
    }
}
