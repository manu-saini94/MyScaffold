package com.ourstory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.net.URI;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.util.UriComponentsBuilder;

/** Context with a (fake) Google client id: registrations, redirects and the admin guard wiring. */
@SpringBootTest(properties = {
        "ourstory.google.client-id=fake-client-id",
        "ourstory.google.client-secret=fake-secret",
        "ourstory.admin-email=owner@example.com",
        "spring.datasource.url=jdbc:h2:mem:ourstory-oauth-test;DB_CLOSE_DELAY=-1"})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class GoogleOAuthWiringTest {

    private static final String PICKER_SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";

    @Autowired MockMvc mvc;
    @Autowired ClientRegistrationRepository registrations;

    private URI redirectFor(String registrationId) throws Exception {
        String location = mvc.perform(get("/oauth2/authorization/" + registrationId))
                .andExpect(status().is3xxRedirection()).andReturn().getResponse().getRedirectedUrl();
        return URI.create(location);
    }

    @Test
    void bothRegistrationsExistWithTheDocumentedRedirectTemplate() {
        var login = registrations.findByRegistrationId("google");
        var picker = registrations.findByRegistrationId("google-picker");
        assertThat(login.getScopes()).containsExactlyInAnyOrder("openid", "email", "profile");
        assertThat(picker.getScopes()).containsExactlyInAnyOrder("openid", "email", "profile", PICKER_SCOPE);
        assertThat(login.getRedirectUri()).isEqualTo("{baseUrl}/login/oauth2/code/{registrationId}");
        assertThat(picker.getRedirectUri()).isEqualTo("{baseUrl}/login/oauth2/code/{registrationId}");
    }

    @Test
    void adminLoginRequestsIdentityScopesOnlyAndNoOfflineAccess() throws Exception {
        URI uri = redirectFor("google");
        var params = UriComponentsBuilder.fromUri(uri).build().getQueryParams();
        assertThat(uri.getHost()).isEqualTo("accounts.google.com");
        assertThat(java.net.URLDecoder.decode(params.getFirst("scope"), "UTF-8")).isEqualTo("openid email profile");
        assertThat(params.containsKey("access_type")).isFalse();
        assertThat(params.containsKey("prompt")).isFalse();
        assertThat(params.getFirst("redirect_uri")).contains("/login/oauth2/code/google");
    }

    @Test
    void pickerConnectRequestsPhotosScopeOfflineAccessAndConsent() throws Exception {
        URI uri = redirectFor("google-picker");
        var params = UriComponentsBuilder.fromUri(uri).build().getQueryParams();
        assertThat(uri.getHost()).isEqualTo("accounts.google.com");
        assertThat(java.net.URLDecoder.decode(params.getFirst("scope"), "UTF-8"))
                .contains(PICKER_SCOPE).contains("openid").contains("email");
        assertThat(params.getFirst("access_type")).isEqualTo("offline");
        assertThat(params.getFirst("include_granted_scopes")).isEqualTo("true");
        assertThat(params.getFirst("prompt")).isEqualTo("consent");
        assertThat(params.getFirst("redirect_uri")).contains("/login/oauth2/code/google-picker");
    }

    @Test
    void anonymousApiCallsStay401() throws Exception {
        mvc.perform(get("/api/admin/me")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/media/x/thumb")).andExpect(status().isUnauthorized());
    }
}
