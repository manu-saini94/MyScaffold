package com.ourstory.auth;

import com.ourstory.config.OurStoryProperties;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * The single place that decides who is the admin: the OIDC email claim must equal ADMIN_EMAIL
 * (case-insensitive) AND email_verified must be true. Fails closed when ADMIN_EMAIL is blank.
 */
@Component
public class AdminGuard {

    public static final String ROLE_ADMIN = "ROLE_ADMIN";

    private final String adminEmail;

    public AdminGuard(OurStoryProperties props) {
        this.adminEmail = props.adminEmail() == null ? "" : props.adminEmail().trim();
    }

    public boolean isAdmin(Map<String, Object> claims) {
        if (adminEmail.isEmpty() || claims == null) {
            return false;
        }
        Object email = claims.get("email");
        return email instanceof String value
                && adminEmail.equalsIgnoreCase(value.trim())
                && isTrue(claims.get("email_verified"));
    }

    private static boolean isTrue(Object flag) {
        // Google sends a boolean; tolerate the string form but nothing else.
        return Boolean.TRUE.equals(flag) || (flag instanceof String s && "true".equalsIgnoreCase(s));
    }
}
