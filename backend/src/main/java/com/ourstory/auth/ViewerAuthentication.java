package com.ourstory.auth;

import java.util.List;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

/** Stateless authentication of a visitor holding a valid viewer cookie: authority ROLE_VIEWER only. */
public final class ViewerAuthentication extends AbstractAuthenticationToken {

    public static final String ROLE_VIEWER = "ROLE_VIEWER";

    public ViewerAuthentication() {
        super(List.of(new SimpleGrantedAuthority(ROLE_VIEWER)));
        setAuthenticated(true);
    }

    @Override
    public Object getCredentials() {
        return "";
    }

    @Override
    public Object getPrincipal() {
        return "viewer";
    }
}
