package com.ourstory.auth;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

/** Builds the Set-Cookie values for the viewer cookie and validates incoming ones against the epoch. */
@Component
public class ViewerCookies {

    public static final String NAME = "os_viewer";
    private static final Logger log = LoggerFactory.getLogger(ViewerCookies.class);

    private final ViewerCookieCodec codec;
    private final ViewerEpoch epoch;
    private final ViewerProperties props;
    private final boolean secure;

    /** {@code secure} follows the session cookie property: true in base/prod, relaxed in the dev profile. */
    public ViewerCookies(ViewerCookieCodec codec, ViewerEpoch epoch, ViewerProperties props,
            @Value("${server.servlet.session.cookie.secure:true}") boolean secure) {
        this.codec = codec;
        this.epoch = epoch;
        this.props = props;
        this.secure = secure;
    }

    /** Set-Cookie header value for a freshly signed cookie bound to the current epoch. */
    public String issueHeader() {
        return build(codec.issue(epoch.current()), props.cookieTtl()).toString();
    }

    public String clearHeader() {
        return build("", Duration.ZERO).toString();
    }

    /** True when the request carries an os_viewer cookie with a valid signature, window and current epoch. */
    public boolean hasValidCookie(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return false;
        }
        for (Cookie cookie : cookies) {
            if (NAME.equals(cookie.getName()) && isValid(cookie.getValue())) {
                return true;
            }
        }
        return false;
    }

    boolean isValid(String value) {
        return codec.verify(value).map(claims -> matchesEpoch(claims.epoch())).orElse(false);
    }

    private boolean matchesEpoch(long claimed) {
        try {
            return claimed == epoch.current();
        } catch (RuntimeException e) {
            log.warn("Could not read the viewer epoch; treating the cookie as invalid ({})",
                    e.getClass().getSimpleName());
            return false;
        }
    }

    private ResponseCookie build(String value, Duration maxAge) {
        return ResponseCookie.from(NAME, value)
                .httpOnly(true)
                .secure(secure)
                .sameSite("Lax")
                .path("/")
                .maxAge(maxAge)
                .build();
    }
}
