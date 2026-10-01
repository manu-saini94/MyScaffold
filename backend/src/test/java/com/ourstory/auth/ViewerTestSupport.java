package com.ourstory.auth;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import jakarta.servlet.http.Cookie;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.OidcLoginRequestPostProcessor;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Shared helpers for the real-cookie, real-CSRF viewer tests (no csrf() shortcut). */
final class ViewerTestSupport {

    static final String ANSWER = "Sample";
    static final String SECRET = "0123456789012345678901234567890123456789";

    private ViewerTestSupport() {
    }

    @TestConfiguration
    static class ClockConfig {
        @Bean
        MutableClock clock() {
            return new MutableClock(Instant.parse("2026-10-01T00:00:00Z"));
        }
    }

    static OidcLoginRequestPostProcessor admin() {
        return oidcLogin().idToken(t -> t.claim("email", "me@example.com"))
                .authorities(new SimpleGrantedAuthority("ROLE_ADMIN"));
    }

    static String xsrf(MockMvc mvc) throws Exception {
        Cookie cookie = mvc.perform(get("/api/auth/status")).andReturn().getResponse().getCookie("XSRF-TOKEN");
        return cookie.getValue();
    }

    /** POST with the real cookie+header CSRF pair and a given client IP. */
    static MockHttpServletRequestBuilder csrfPost(MockMvc mvc, String path, String ip, String body)
            throws Exception {
        String token = xsrf(mvc);
        MockHttpServletRequestBuilder builder = post(path).cookie(new Cookie("XSRF-TOKEN", token))
                .header("X-XSRF-TOKEN", token).with(request -> {
                    request.setRemoteAddr(ip);
                    return request;
                });
        if (body != null) {
            builder.contentType(MediaType.APPLICATION_JSON).content(body.getBytes(StandardCharsets.UTF_8));
        }
        return builder;
    }

    static MockHttpServletRequestBuilder csrfPut(MockMvc mvc, String path, String body) throws Exception {
        String token = xsrf(mvc);
        return org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(path)
                .cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token)
                .contentType(MediaType.APPLICATION_JSON).content(body.getBytes(StandardCharsets.UTF_8));
    }

    static String unlockBody(String answer) {
        return "{\"answer\":\"" + answer + "\"}";
    }

    /** Unlocks for real and returns the os_viewer cookie. */
    static Cookie unlockedCookie(MockMvc mvc, String ip) throws Exception {
        return mvc.perform(csrfPost(mvc, "/api/auth/unlock", ip, unlockBody(ANSWER))).andReturn().getResponse()
                .getCookie(ViewerCookies.NAME);
    }
}
