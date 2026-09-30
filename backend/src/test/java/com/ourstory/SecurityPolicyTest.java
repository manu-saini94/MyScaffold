package com.ourstory;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.OidcLoginRequestPostProcessor;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/** Default-deny routing, security headers and the CSRF-everywhere rule (test profile: dev tools ON). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SecurityPolicyTest {

    static final String CSP = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; "
            + "frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

    @Autowired MockMvc mvc;

    private static OidcLoginRequestPostProcessor admin() {
        return oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"));
    }

    private static OidcLoginRequestPostProcessor stranger() {
        return oidcLogin();
    }

    @Test
    void apiResponsesCarryTheSecurityHeaders() throws Exception {
        mvc.perform(get("/api/admin/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string("Content-Security-Policy", CSP))
                .andExpect(header().string("Referrer-Policy", "strict-origin-when-cross-origin"))
                .andExpect(header().string("Permissions-Policy", "camera=(), microphone=(), geolocation=()"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("X-Frame-Options", "DENY"));
        mvc.perform(get("/api/admin/media").with(admin()))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Security-Policy", CSP))
                .andExpect(header().string("Referrer-Policy", "strict-origin-when-cross-origin"))
                .andExpect(header().string("Permissions-Policy", "camera=(), microphone=(), geolocation=()"));
        mvc.perform(get("/actuator/health"))
                .andExpect(header().string("Content-Security-Policy", CSP));
    }

    @Test
    void unknownPathsAreDeniedForEveryone() throws Exception {
        for (String path : new String[] {"/nothing", "/api/experience", "/actuator/env", "/api/whatever/x",
                "/dev-not", "/private/file"}) {
            mvc.perform(get(path)).andExpect(status().isUnauthorized());
            mvc.perform(get(path).with(stranger())).andExpect(status().isForbidden());
            mvc.perform(get(path).with(admin())).andExpect(status().isForbidden());
        }
    }

    @Test
    void healthAndOauthEntryPointsStayReachable() throws Exception {
        mvc.perform(get("/actuator/health")).andExpect(status().isOk());
        // No Google client in this context, so Spring's own handling answers, but it is not denied by us.
        mvc.perform(get("/oauth2/authorization/google")).andExpect(status().is4xxClientError());
        mvc.perform(get("/login/oauth2/code/google")).andExpect(status().is4xxClientError());
    }

    @Test
    void adminAndMediaApisNeedTheAdminRole() throws Exception {
        for (String path : new String[] {"/api/admin/me", "/api/media/x/thumb", "/api/admin/imports/x"}) {
            mvc.perform(get(path)).andExpect(status().isUnauthorized());
            mvc.perform(get(path).with(stranger())).andExpect(status().isForbidden());
        }
    }

    @Test
    void devPagesAreServedWhenDevToolsAreEnabled() throws Exception {
        mvc.perform(get("/dev/import.html")).andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("import.js")))
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("<script>"))))
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("<style>"))));
        mvc.perform(get("/dev/import.js")).andExpect(status().isOk());
        mvc.perform(get("/dev/import.css")).andExpect(status().isOk());
    }

    @Test
    void everyNonSafeMethodNeedsACsrfTokenOnEveryPath() throws Exception {
        for (String path : new String[] {"/logout", "/api/admin/picker/sessions", "/api/media/x/thumb",
                "/dev/import.html", "/anything", "/actuator/health"}) {
            mvc.perform(post(path).with(admin())).andExpect(status().isForbidden());
            mvc.perform(post(path)).andExpect(status().isForbidden());
        }
        // With a token the request reaches authorization/routing instead of being stopped by CSRF.
        mvc.perform(post("/anything").with(admin()).with(csrf())).andExpect(status().isForbidden());
        mvc.perform(post("/actuator/health").with(csrf())).andExpect(status().isMethodNotAllowed());
    }
}
