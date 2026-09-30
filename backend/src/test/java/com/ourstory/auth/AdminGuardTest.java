package com.ourstory.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.ourstory.TestSupport;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.OAuth2AccessToken;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.OidcUserAuthority;
import org.springframework.security.oauth2.core.user.OAuth2UserAuthority;

class AdminGuardTest {

    private static AdminGuard guard(String adminEmail) {
        return new AdminGuard(TestSupport.props("./data", adminEmail, List.of("x"), 1024, 1));
    }

    private static Map<String, Object> claims(Object email, Object verified) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("email", email);
        claims.put("email_verified", verified);
        return claims;
    }

    @Test
    void acceptsMatchingVerifiedEmailIgnoringCase() {
        assertThat(guard("Me@Example.com").isAdmin(claims("me@example.COM", true))).isTrue();
        assertThat(guard(" me@example.com ").isAdmin(claims(" me@example.com", "true"))).isTrue();
    }

    @Test
    void rejectsUnverifiedOrMissingVerification() {
        assertThat(guard("me@example.com").isAdmin(claims("me@example.com", false))).isFalse();
        assertThat(guard("me@example.com").isAdmin(claims("me@example.com", null))).isFalse();
        assertThat(guard("me@example.com").isAdmin(claims("me@example.com", "yes"))).isFalse();
        assertThat(guard("me@example.com").isAdmin(claims("me@example.com", 1))).isFalse();
    }

    @Test
    void rejectsOtherOrMalformedEmails() {
        assertThat(guard("me@example.com").isAdmin(claims("other@example.com", true))).isFalse();
        assertThat(guard("me@example.com").isAdmin(claims("me@example.com.evil.io", true))).isFalse();
        assertThat(guard("me@example.com").isAdmin(claims(42, true))).isFalse();
        assertThat(guard("me@example.com").isAdmin(claims(null, true))).isFalse();
        assertThat(guard("me@example.com").isAdmin(Map.of())).isFalse();
        assertThat(guard("me@example.com").isAdmin(null)).isFalse();
    }

    @Test
    void failsClosedWhenAdminEmailIsBlankOrUnset() {
        assertThat(guard("").isAdmin(claims("", true))).isFalse();
        assertThat(guard("   ").isAdmin(claims("   ", true))).isFalse();
        assertThat(guard(null).isAdmin(claims("me@example.com", true))).isFalse();
    }

    @Test
    void mapperAddsAdminRoleOnlyForAcceptedOidcUsers() {
        AdminAuthoritiesMapper mapper = new AdminAuthoritiesMapper(guard("me@example.com"));
        assertThat(names(mapper.mapAuthorities(List.of(oidc("me@example.com", true)))))
                .contains(AdminGuard.ROLE_ADMIN, "OIDC_USER");
        assertThat(names(mapper.mapAuthorities(List.of(oidc("me@example.com", false)))))
                .doesNotContain(AdminGuard.ROLE_ADMIN);
        assertThat(names(mapper.mapAuthorities(List.of(oidc("evil@example.com", true)))))
                .doesNotContain(AdminGuard.ROLE_ADMIN);
        // A plain OAuth2 authority carrying the same claims is not an OIDC identity: no admin.
        assertThat(names(mapper.mapAuthorities(List.of(
                new OAuth2UserAuthority(claims("me@example.com", true))))))
                .doesNotContain(AdminGuard.ROLE_ADMIN);
        assertThat(mapper.mapAuthorities(List.of())).isEmpty();
    }

    private static OidcUserAuthority oidc(String email, boolean verified) {
        OidcIdToken token = OidcIdToken.withTokenValue("t").subject("sub-1").issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(60)).claim("email", email).claim("email_verified", verified)
                .build();
        return new OidcUserAuthority(token);
    }

    private static List<String> names(java.util.Collection<? extends GrantedAuthority> authorities) {
        return authorities.stream().map(GrantedAuthority::getAuthority).toList();
    }

    @SuppressWarnings("unused")
    private static final Class<?>[] UNUSED = {OAuth2AccessToken.class, SimpleGrantedAuthority.class};
}
