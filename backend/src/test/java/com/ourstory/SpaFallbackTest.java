package com.ourstory;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.head;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;

import com.ourstory.config.SpaRoutes;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/** The jar serves the SPA: client routes get index.html (200), the API and real files behave as before. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SpaFallbackTest {

    @Autowired MockMvc mvc;

    @ParameterizedTest
    @ValueSource(strings = {"/index.html", "/unlock", "/who", "/admin", "/admin/", "/admin/worlds/abc",
            "/world/our-first-date", "/world/a/b", "/story", "/some/unknown/route"})
    void clientRoutesServeIndexHtmlWithNoCache(String path) throws Exception {
        mvc.perform(get(path))
            .andExpect(status().isOk())
            .andExpect(content().string(org.hamcrest.Matchers.containsString("spa-test-index")))
            .andExpect(header().string("Cache-Control", "no-cache"));
    }

    @Test
    void rootIsForwardedToIndexHtml() throws Exception {
        // MockMvc does not follow forwards; the servlet container then serves index.html through the resource handler.
        mvc.perform(get("/")).andExpect(status().isOk()).andExpect(forwardedUrl("index.html"));
    }

    @Test
    void headIsAllowedToo() throws Exception {
        mvc.perform(head("/who")).andExpect(status().isOk());
    }

    @Test
    void clientRoutesAreGetOnly() throws Exception {
        // POST needs CSRF and is not a permitted route: anonymous gets 401, never index.html.
        mvc.perform(post("/who").with(csrf())).andExpect(status().isUnauthorized());
        mvc.perform(post("/admin/worlds").with(csrf())).andExpect(status().isUnauthorized());
    }

    @Test
    void hashedAssetsAreImmutableForAYear() throws Exception {
        mvc.perform(get("/assets/index-AbC123.js"))
            .andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", "max-age=31536000, public, immutable"));
    }

    @Test
    void missingAssetIsNotRewrittenToIndex() throws Exception {
        mvc.perform(get("/assets/missing-XyZ.js")).andExpect(status().isNotFound());
        mvc.perform(get("/assets/nofile")).andExpect(status().isNotFound());
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/experience", "/api/worlds/x", "/api/media/x/thumb", "/api/admin/me",
            "/api/does-not-exist", "/api/admin/nope/deeper"})
    void apiPathsKeepTheirAnonymousPosture(String path) throws Exception {
        mvc.perform(get(path)).andExpect(status().isUnauthorized());
    }

    @Test
    void unknownFilesAndOtherActuatorEndpointsAreNotIndexHtml() throws Exception {
        mvc.perform(get("/nope.png")).andExpect(status().isUnauthorized());
        mvc.perform(get("/actuator/env")).andExpect(status().is4xxClientError());
        mvc.perform(get("/actuator/health")).andExpect(status().isOk());
    }

    @Test
    void routeClassification() {
        assertTrue(SpaRoutes.isClientRoute("/admin/letters"));
        assertTrue(SpaRoutes.isClientRoute("world/x"));
        assertFalse(SpaRoutes.isClientRoute("/"));
        assertFalse(SpaRoutes.isClientRoute("/api/x"));
        assertFalse(SpaRoutes.isClientRoute("/API/x"));
        assertFalse(SpaRoutes.isClientRoute("/oauth2/authorization/google"));
        assertFalse(SpaRoutes.isClientRoute("/login/oauth2/code/google"));
        assertFalse(SpaRoutes.isClientRoute("/logout"));
        assertFalse(SpaRoutes.isClientRoute("/actuator/health"));
        assertFalse(SpaRoutes.isClientRoute("/assets/x"));
        assertFalse(SpaRoutes.isClientRoute("/a.b"));
        assertFalse(SpaRoutes.isClientRoute("/world/../etc"));
        assertFalse(SpaRoutes.isClientRoute("/a//b"));
        assertFalse(SpaRoutes.isClientRoute("/a%2fb"));
        assertFalse(SpaRoutes.isClientRoute(null));
    }
}
