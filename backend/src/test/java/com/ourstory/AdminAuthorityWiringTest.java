package com.ourstory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ourstory.auth.AdminAuthoritiesMapper;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.mapping.GrantedAuthoritiesMapper;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClientService;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.core.OAuth2AccessToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Google configured with ADMIN_EMAIL=owner@example.com. Proves that the mapper used by the REAL oauth2Login
 * OIDC provider is the AdminAuthoritiesMapper bean (deleting the wiring in SecurityConfig fails these tests)
 * and that it decides admin-ness correctly at the filter-chain level. Also covers logout token cleanup.
 */
@SpringBootTest(properties = {
        "ourstory.google.client-id=fake-client-id",
        "ourstory.google.client-secret=fake-secret",
        "ourstory.admin-email=owner@example.com",
        "spring.datasource.url=jdbc:h2:mem:ourstory-authority-test;DB_CLOSE_DELAY=-1"})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdminAuthorityWiringTest {

    @Autowired ApplicationContext context;
    @Autowired MockMvc mvc;
    @Autowired OAuth2AuthorizedClientService clients;
    @Autowired ClientRegistrationRepository registrations;

    private List<String> rolesFor(Object email, Object verified) {
        GrantedAuthoritiesMapper mapper = WiredMapper.from(context);
        return mapper.mapAuthorities(List.of(WiredMapper.oidc(email, verified))).stream()
                .map(GrantedAuthority::getAuthority).toList();
    }

    @Test
    void theOauthLoginProviderUsesTheAdminAuthoritiesMapperBean() {
        assertThat(WiredMapper.from(context)).isSameAs(context.getBean(AdminAuthoritiesMapper.class));
    }

    @Test
    void verifiedAdminEmailGetsTheAdminRoleCaseInsensitively() {
        assertThat(rolesFor("owner@example.com", true)).contains("ROLE_ADMIN");
        assertThat(rolesFor("Owner@Example.COM", "true")).contains("ROLE_ADMIN");
    }

    @Test
    void unverifiedAliasedOrForeignEmailsNeverGetTheAdminRole() {
        assertThat(rolesFor("owner@example.com", false)).doesNotContain("ROLE_ADMIN");
        assertThat(rolesFor("owner@example.com", null)).doesNotContain("ROLE_ADMIN");
        assertThat(rolesFor("owner+alias@example.com", true)).doesNotContain("ROLE_ADMIN");
        assertThat(rolesFor("o.wner@example.com", true)).doesNotContain("ROLE_ADMIN");
        assertThat(rolesFor("owner@example.com.evil.io", true)).doesNotContain("ROLE_ADMIN");
        assertThat(rolesFor("", true)).doesNotContain("ROLE_ADMIN");
        assertThat(rolesFor(null, true)).doesNotContain("ROLE_ADMIN");
    }

    @Test
    void logoutRemovesTheStoredGoogleTokensOfThePrincipal() throws Exception {
        OAuth2AccessToken token = new OAuth2AccessToken(OAuth2AccessToken.TokenType.BEARER, "t", Instant.now(),
                Instant.now().plusSeconds(60));
        var login = oidcLogin().idToken(t -> t.subject("logout-sub"));
        Authentication principal = new org.springframework.security.authentication.TestingAuthenticationToken(
                "logout-sub", "n/a");
        for (String id : new String[] {"google", "google-picker"}) {
            clients.saveAuthorizedClient(new OAuth2AuthorizedClient(registrations.findByRegistrationId(id),
                    "logout-sub", token), principal);
        }
        mvc.perform(post("/logout").with(login).with(csrf())).andExpect(status().isOk());
        assertThat((Object) clients.loadAuthorizedClient("google", "logout-sub")).isNull();
        assertThat((Object) clients.loadAuthorizedClient("google-picker", "logout-sub")).isNull();
    }
}
