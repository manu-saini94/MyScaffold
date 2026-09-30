package com.ourstory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ourstory.auth.PickerTokenProvider;
import com.ourstory.google.PickerClient;
import com.ourstory.google.PickerModels.PickerSession;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.OidcLoginRequestPostProcessor;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The REAL CSRF cookie flow: no csrf() test shortcut, the token travels as cookie plus header. It has its own
 * Spring context (unique datasource URL) because the csrf() post-processor permanently swaps the CsrfFilter
 * token repository of whatever cached context it touches, which would hide the cookie repository.
 */
@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:ourstory-csrf-flow-test;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CsrfFlowTest {

    private static final String CREATE = "/api/admin/picker/sessions";

    @Autowired MockMvc mvc;
    @MockitoBean PickerTokenProvider tokens;
    @MockitoBean PickerClient picker;

    @BeforeEach
    void stubGoogle() {
        when(tokens.accessToken(any())).thenReturn("tok");
        when(picker.createSession(eq("tok"), any())).thenReturn(new PickerSession("sess_abc123",
                "https://photos.google.com/picker/xyz", null, "2026-10-01T00:00:00Z", false));
    }

    private static OidcLoginRequestPostProcessor admin() {
        return oidcLogin().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"));
    }

    private String issuedToken() throws Exception {
        var response = mvc.perform(get("/api/admin/me").with(admin())).andExpect(status().isOk())
                .andReturn().getResponse();
        Cookie cookie = response.getCookie("XSRF-TOKEN");
        assertThat(cookie).as("XSRF-TOKEN cookie on an ordinary GET").isNotNull();
        assertThat(cookie.getValue()).isNotBlank();
        assertThat(cookie.isHttpOnly()).isFalse(); // the SPA must read it
        assertThat(cookie.getAttribute("SameSite")).isEqualTo("Lax");
        return cookie.getValue();
    }

    @Test
    void aMatchingCookieAndHeaderSucceeds() throws Exception {
        String token = issuedToken();
        mvc.perform(post(CREATE).with(admin()).cookie(new Cookie("XSRF-TOKEN", token))
                        .header("X-XSRF-TOKEN", token))
                .andExpect(status().isOk());
    }

    @Test
    void aWrongOrMissingHeaderIsForbidden() throws Exception {
        String token = issuedToken();
        Cookie cookie = new Cookie("XSRF-TOKEN", token);
        mvc.perform(post(CREATE).with(admin()).cookie(cookie).header("X-XSRF-TOKEN", token + "x"))
                .andExpect(status().isForbidden());
        mvc.perform(post(CREATE).with(admin()).cookie(cookie).header("X-XSRF-TOKEN", ""))
                .andExpect(status().isForbidden());
        mvc.perform(post(CREATE).with(admin()).cookie(cookie)).andExpect(status().isForbidden());
    }

    @Test
    void aHeaderWithoutTheCookieIsForbidden() throws Exception {
        String token = issuedToken();
        mvc.perform(post(CREATE).with(admin()).header("X-XSRF-TOKEN", token)).andExpect(status().isForbidden());
    }

    @Test
    void logoutNeedsTheTokenToo() throws Exception {
        mvc.perform(post("/logout").with(admin())).andExpect(status().isForbidden());
        String token = issuedToken();
        mvc.perform(post("/logout").with(admin()).cookie(new Cookie("XSRF-TOKEN", token))
                        .header("X-XSRF-TOKEN", token))
                .andExpect(status().isOk());
    }
}
