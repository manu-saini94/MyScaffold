package com.ourstory;

import jakarta.servlet.Filter;
import java.time.Instant;
import org.springframework.context.ApplicationContext;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.core.authority.mapping.GrantedAuthoritiesMapper;
import org.springframework.security.oauth2.client.oidc.authentication.OidcAuthorizationCodeAuthenticationProvider;
import org.springframework.security.oauth2.client.web.OAuth2LoginAuthenticationFilter;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.OidcUserAuthority;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Digs the authorities mapper out of the REAL security filter chain (the OIDC provider that the
 * oauth2Login filter actually uses), so tests fail when the mapper wiring in SecurityConfig is removed.
 */
final class WiredMapper {

    private WiredMapper() {
    }

    static GrantedAuthoritiesMapper from(ApplicationContext context) {
        FilterChainProxy proxy = context.getBean("springSecurityFilterChain", FilterChainProxy.class);
        for (SecurityFilterChain chain : proxy.getFilterChains()) {
            for (Filter filter : chain.getFilters()) {
                if (filter instanceof OAuth2LoginAuthenticationFilter login) {
                    return mapperOf(login);
                }
            }
        }
        throw new AssertionError("No OAuth2LoginAuthenticationFilter in the security chain");
    }

    private static GrantedAuthoritiesMapper mapperOf(OAuth2LoginAuthenticationFilter login) {
        AuthenticationManager manager = (AuthenticationManager) ReflectionTestUtils.getField(login,
                "authenticationManager");
        while (!(manager instanceof ProviderManager)) { // Boot wraps the manager for observations
            manager = (AuthenticationManager) ReflectionTestUtils.getField(manager, "delegate");
        }
        for (AuthenticationProvider provider : ((ProviderManager) manager).getProviders()) {
            if (provider instanceof OidcAuthorizationCodeAuthenticationProvider oidc) {
                return (GrantedAuthoritiesMapper) ReflectionTestUtils.getField(oidc, "authoritiesMapper");
            }
        }
        throw new AssertionError("No OIDC provider behind the oauth2Login filter");
    }

    static OidcUserAuthority oidc(Object email, Object verified) {
        OidcIdToken.Builder token = OidcIdToken.withTokenValue("t").subject("sub-1").issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(60));
        if (email != null) {
            token.claim("email", email);
        }
        if (verified != null) {
            token.claim("email_verified", verified);
        }
        return new OidcUserAuthority(token.build());
    }
}
