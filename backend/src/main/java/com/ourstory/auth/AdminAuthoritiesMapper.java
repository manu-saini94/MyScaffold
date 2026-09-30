package com.ourstory.auth;

import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.Set;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.authority.mapping.GrantedAuthoritiesMapper;
import org.springframework.security.oauth2.core.oidc.user.OidcUserAuthority;
import org.springframework.stereotype.Component;

/** Adds ROLE_ADMIN after OIDC login when {@link AdminGuard} accepts the ID-token claims. */
@Component
public class AdminAuthoritiesMapper implements GrantedAuthoritiesMapper {

    private final AdminGuard guard;

    public AdminAuthoritiesMapper(AdminGuard guard) {
        this.guard = guard;
    }

    @Override
    public Collection<? extends GrantedAuthority> mapAuthorities(Collection<? extends GrantedAuthority> authorities) {
        Set<GrantedAuthority> mapped = new LinkedHashSet<>(authorities);
        for (GrantedAuthority authority : authorities) {
            if (authority instanceof OidcUserAuthority oidc && guard.isAdmin(oidc.getAttributes())) {
                mapped.add(new SimpleGrantedAuthority(AdminGuard.ROLE_ADMIN));
                break;
            }
        }
        return mapped;
    }
}
