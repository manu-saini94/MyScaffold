package com.ourstory.auth;

import static com.ourstory.auth.ViewerTestSupport.csrfPost;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/** Fail closed: no credentials configured means nobody can unlock. Also covers the dev-profile cookie flag. */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:ourstory-unconfigured;DB_CLOSE_DELAY=-1",
        "server.servlet.session.cookie.secure=false"})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class UnlockNotConfiguredTest {

    @Autowired MockMvc mvc;
    @Autowired ViewerCookies cookies;

    @Test
    void questionAndUnlockAre503() throws Exception {
        mvc.perform(get("/api/auth/question")).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.type").value("urn:ourstory:problem:unlock-not-configured"));
        mvc.perform(csrfPost(mvc, "/api/auth/unlock", "10.9.0.1", "{\"answer\":\"anything\"}"))
                .andExpect(status().isServiceUnavailable());
        mvc.perform(get("/api/auth/status")).andExpect(jsonPath("$.unlocked").value(false));
    }

    @Test
    void cookieSecureFlagFollowsTheSessionCookieProperty() {
        org.assertj.core.api.Assertions.assertThat(cookies.issueHeader())
                .contains("HttpOnly").contains("SameSite=Lax").doesNotContain("Secure");
        org.assertj.core.api.Assertions.assertThat(cookies.clearHeader()).contains("Max-Age=0");
    }
}
