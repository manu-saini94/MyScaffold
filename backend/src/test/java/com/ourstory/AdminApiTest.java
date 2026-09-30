package com.ourstory;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ourstory.auth.PickerTokenProvider;
import com.ourstory.common.GoogleReconnectRequiredException;
import com.ourstory.common.UlidGenerator;
import com.ourstory.google.GoogleApiException;
import com.ourstory.google.PickerClient;
import com.ourstory.google.PickerModels.PickerSession;
import com.ourstory.google.PickerModels.PollingConfig;
import com.ourstory.media.MediaRecord;
import com.ourstory.media.MediaRepository;
import com.ourstory.media.MediaSize;
import com.ourstory.media.MediaStorage;
import java.awt.Color;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.OidcLoginRequestPostProcessor;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/** Full-context tests of the HTTP surface: security rules, ProblemDetail errors, media serving. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdminApiTest {

    @Autowired MockMvc mvc;
    @Autowired MediaRepository media;
    @Autowired MediaStorage storage;
    @Autowired UlidGenerator ulids;
    @Autowired JdbcClient jdbc;

    @MockitoBean PickerTokenProvider tokens;
    @MockitoBean PickerClient picker;

    private static OidcLoginRequestPostProcessor admin() {
        return oidcLogin().idToken(t -> t.claim("email", "me@example.com").claim("name", "Me Owner"))
                .authorities(new SimpleGrantedAuthority("ROLE_ADMIN"));
    }

    private static OidcLoginRequestPostProcessor stranger() {
        return oidcLogin().idToken(t -> t.claim("email", "evil@example.com"));
    }

    @AfterEach
    void cleanUp() {
        jdbc.sql("SELECT id FROM media").query(String.class).list().forEach(storage::deleteAll);
        jdbc.sql("DELETE FROM media").update();
    }

    private String seedMedia() throws Exception {
        String id = ulids.next();
        media.insert(new MediaRecord(id, "g-" + id, "image/jpeg", 100, 50, null, "a.jpg", "data:image/jpeg;base64,AA==",
                "#112233", OffsetDateTime.now(ZoneOffset.UTC).truncatedTo(ChronoUnit.MILLIS)));
        for (MediaSize size : MediaSize.values()) {
            storage.write(id, size, TestSupport.jpeg(Color.GREEN, 8, 8));
        }
        return id;
    }

    // --- /api/admin/me -------------------------------------------------------------------------

    @Test
    void meIs401WhenAnonymousAnd403ForNonAdmin() throws Exception {
        mvc.perform(get("/api/admin/me")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/me").with(stranger())).andExpect(status().isForbidden());
    }

    @Test
    void meReportsIdentityAndPickerConnection() throws Exception {
        when(tokens.isConnected(any())).thenReturn(false);
        mvc.perform(get("/api/admin/me").with(admin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("me@example.com"))
                .andExpect(jsonPath("$.name").value("Me Owner"))
                .andExpect(jsonPath("$.admin").value(true))
                .andExpect(jsonPath("$.pickerConnected").value(false));
        when(tokens.isConnected(any())).thenReturn(true);
        mvc.perform(get("/api/admin/me").with(admin())).andExpect(jsonPath("$.pickerConnected").value(true));
    }

    // --- picker session endpoints -----------------------------------------------------------------

    @Test
    void createSessionReturnsAutocloseUriAndPolling() throws Exception {
        when(tokens.accessToken(any())).thenReturn("tok");
        when(picker.createSession(eq("tok"), any())).thenReturn(new PickerSession("sess_abc123",
                "https://photos.google.com/picker/xyz", new PollingConfig("3s", "300s"), "2026-10-01T00:00:00Z", false));
        mvc.perform(post("/api/admin/picker/sessions").with(admin()).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sessionId").value("sess_abc123"))
                .andExpect(jsonPath("$.pickerUri").value("https://photos.google.com/picker/xyz/autoclose"))
                .andExpect(jsonPath("$.pollingConfig.pollIntervalMs").value(3000))
                .andExpect(jsonPath("$.pollingConfig.timeoutMs").value(300000));
    }

    @Test
    void mutatingAdminCallsRequireCsrf() throws Exception {
        mvc.perform(post("/api/admin/picker/sessions").with(admin())).andExpect(status().isForbidden());
        mvc.perform(delete("/api/admin/media/" + ulids.next()).with(admin())).andExpect(status().isForbidden());
    }

    @Test
    void reconnectRequiredIs409ProblemDetailWithAuthorizeUrl() throws Exception {
        when(tokens.accessToken(any())).thenThrow(new GoogleReconnectRequiredException());
        mvc.perform(post("/api/admin/picker/sessions").with(admin()).with(csrf()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.authorizeUrl").value("/oauth2/authorization/google-picker"))
                .andExpect(jsonPath("$.status").value(409))
                .andExpect(jsonPath("$.type").value("urn:ourstory:problem:google-reconnect-required"));
        mvc.perform(get("/api/admin/picker/sessions/sess_abc123").with(admin()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.authorizeUrl").exists());
    }

    @Test
    void sessionStatusValidatesIdAndProxiesGoogle() throws Exception {
        when(tokens.accessToken(any())).thenReturn("tok");
        when(picker.getSession("tok", "sess_abc123")).thenReturn(
                new PickerSession("sess_abc123", null, null, "2026-10-01T00:00:00Z", true));
        mvc.perform(get("/api/admin/picker/sessions/sess_abc123").with(admin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mediaItemsSet").value(true))
                .andExpect(jsonPath("$.expireTime").value("2026-10-01T00:00:00Z"));
        mvc.perform(get("/api/admin/picker/sessions/short").with(admin()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Invalid picker session id"));
    }

    @Test
    void upstreamErrorsBecome502WithoutLeakingDetails() throws Exception {
        when(tokens.accessToken(any())).thenReturn("tok");
        when(picker.getSession(any(), any())).thenThrow(new GoogleApiException(500));
        mvc.perform(get("/api/admin/picker/sessions/sess_abc123").with(admin()))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.detail").value("Google Photos rejected the request (HTTP 500)."));
    }

    @Test
    void unexpectedErrorsBecomeGeneric500() throws Exception {
        when(tokens.accessToken(any())).thenThrow(new IllegalStateException("db password is hunter2"));
        mvc.perform(get("/api/admin/picker/sessions/sess_abc123").with(admin()))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.detail").value("Unexpected server error"));
    }

    // --- import endpoints -----------------------------------------------------------------------------

    @Test
    void importStatusValidatesAndReports404() throws Exception {
        mvc.perform(get("/api/admin/imports/nope").with(admin())).andExpect(status().isBadRequest());
        mvc.perform(get("/api/admin/imports/" + ulids.next()).with(admin())).andExpect(status().isNotFound());
        mvc.perform(get("/api/admin/imports/" + ulids.next())).andExpect(status().isUnauthorized());
    }

    @Test
    void importRequiresReconnectWhenTokenIsGone() throws Exception {
        when(tokens.accessToken(any())).thenThrow(new GoogleReconnectRequiredException());
        mvc.perform(post("/api/admin/picker/sessions/sess_abc123/import").with(admin()).with(csrf()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.authorizeUrl").exists());
        mvc.perform(post("/api/admin/picker/sessions/bad!/import").with(admin()).with(csrf()))
                .andExpect(status().isBadRequest());
    }

    // --- admin media -----------------------------------------------------------------------------------

    @Test
    void listsMediaNewestFirstWithPagingBounds() throws Exception {
        String first = seedMedia();
        Thread.sleep(5);
        String second = seedMedia();
        mvc.perform(get("/api/admin/media?unassigned=true&page=0&size=1").with(admin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].id").value(second))
                .andExpect(jsonPath("$.items[0].dominantColor").value("#112233"));
        mvc.perform(get("/api/admin/media?page=1&size=1").with(admin()))
                .andExpect(jsonPath("$.items[0].id").value(first));
        mvc.perform(get("/api/admin/media?size=101").with(admin())).andExpect(status().isBadRequest());
        mvc.perform(get("/api/admin/media?size=0").with(admin())).andExpect(status().isBadRequest());
        mvc.perform(get("/api/admin/media?page=-1").with(admin())).andExpect(status().isBadRequest());
        mvc.perform(get("/api/admin/media?page=abc").with(admin())).andExpect(status().isBadRequest());
        mvc.perform(get("/api/admin/media").with(stranger())).andExpect(status().isForbidden());
    }

    @Test
    void deletingMediaRemovesRowAndFilesAndNeverCallsGoogle() throws Exception {
        String id = seedMedia();
        mvc.perform(delete("/api/admin/media/" + id).with(admin()).with(csrf())).andExpect(status().isNoContent());
        org.assertj.core.api.Assertions.assertThat(media.findById(id)).isEmpty();
        org.assertj.core.api.Assertions.assertThat(storage.find(id, MediaSize.THUMB)).isEmpty();
        mvc.perform(delete("/api/admin/media/" + id).with(admin()).with(csrf())).andExpect(status().isNotFound());
        mvc.perform(delete("/api/admin/media/not-an-id").with(admin()).with(csrf())).andExpect(status().isBadRequest());
        org.mockito.Mockito.verifyNoInteractions(picker);
    }

    // --- media serving -------------------------------------------------------------------------------------

    @Test
    void servesImagesWithStrongEtagAndImmutableCaching() throws Exception {
        String id = seedMedia();
        var result = mvc.perform(get("/api/media/" + id + "/thumb").with(admin()))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/jpeg"))
                .andExpect(header().string("Cache-Control", "max-age=31536000, private, immutable"))
                .andExpect(header().exists("ETag"))
                .andReturn();
        String etag = result.getResponse().getHeader("ETag");
        org.assertj.core.api.Assertions.assertThat(etag).startsWith("\"").doesNotStartWith("W/");

        mvc.perform(get("/api/media/" + id + "/thumb").with(admin()).header("If-None-Match", etag))
                .andExpect(status().isNotModified()).andExpect(header().string("ETag", etag));
        mvc.perform(get("/api/media/" + id + "/thumb").with(admin()).header("If-None-Match", "W/" + etag + ", \"other\""))
                .andExpect(status().isNotModified());
        mvc.perform(get("/api/media/" + id + "/thumb").with(admin()).header("If-None-Match", "*"))
                .andExpect(status().isNotModified());
        mvc.perform(get("/api/media/" + id + "/thumb").with(admin()).header("If-None-Match", "\"stale\""))
                .andExpect(status().isOk());
        // Different size => different validator.
        String mediumEtag = mvc.perform(get("/api/media/" + id + "/medium").with(admin())).andReturn()
                .getResponse().getHeader("ETag");
        org.assertj.core.api.Assertions.assertThat(mediumEtag).isNotEqualTo(etag);
    }

    @Test
    void mediaServingIsProtectedAndWhitelisted() throws Exception {
        String id = seedMedia();
        mvc.perform(get("/api/media/" + id + "/thumb")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/media/x/thumb")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/media/" + id + "/thumb").with(stranger())).andExpect(status().isForbidden());
        mvc.perform(get("/api/media/" + id + "/lqip").with(admin())).andExpect(status().isNotFound());
        mvc.perform(get("/api/media/" + id + "/original").with(admin())).andExpect(status().isNotFound());
        mvc.perform(get("/api/media/x/thumb").with(admin())).andExpect(status().isNotFound());
        mvc.perform(get("/api/media/" + ulids.next() + "/thumb").with(admin()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404));
    }

    @Test
    void staticDevPageIsPublicButApiStaysProtected() throws Exception {
        mvc.perform(get("/dev/import.html")).andExpect(status().isOk());
        mvc.perform(get("/api/anything")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/media")).andExpect(status().isUnauthorized());
    }
}
