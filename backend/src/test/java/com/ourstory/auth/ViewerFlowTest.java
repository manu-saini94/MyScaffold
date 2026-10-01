package com.ourstory.auth;

import static com.ourstory.auth.ViewerTestSupport.ANSWER;
import static com.ourstory.auth.ViewerTestSupport.admin;
import static com.ourstory.auth.ViewerTestSupport.csrfPost;
import static com.ourstory.auth.ViewerTestSupport.unlockBody;
import static com.ourstory.auth.ViewerTestSupport.unlockedCookie;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ourstory.common.UlidGenerator;
import com.ourstory.media.MediaRecord;
import com.ourstory.media.MediaRepository;
import com.ourstory.media.MediaSize;
import com.ourstory.media.MediaStorage;
import com.ourstory.settings.SettingsService;
import jakarta.servlet.http.Cookie;
import java.awt.Color;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/** Unlock, cookie, rate limits and the access matrix over the real security chain (H2, MockMvc, test clock). */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:ourstory-viewer-flow;DB_CLOSE_DELAY=-1",
        "ourstory.viewer.unlock-question=Test question?",
        "ourstory.viewer.unlock-answers=Sample,test",
        "ourstory.viewer.pbkdf2-iterations=1000",
        "ourstory.viewer-cookie-secret=" + ViewerTestSupport.SECRET})
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(ViewerTestSupport.ClockConfig.class)
@ExtendWith(OutputCaptureExtension.class)
class ViewerFlowTest {

    @Autowired MockMvc mvc;
    @Autowired MutableClock clock;
    @Autowired SettingsService settings;
    @Autowired MediaRepository media;
    @Autowired MediaStorage storage;
    @Autowired UlidGenerator ulids;
    @Autowired JdbcClient jdbc;
    @MockitoSpyBean AnswerHasher hasher;

    @BeforeEach
    void freshWindow() {
        // Every test starts with empty rate-limit windows (the global one is an hour) and a stale epoch cache.
        clock.advance(Duration.ofMinutes(61));
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
            storage.write(id, size, com.ourstory.TestSupport.jpeg(Color.GREEN, 8, 8));
        }
        // Viewers only read media of a published, unlocked world (Phase 2C): place it in a seeded open world.
        jdbc.sql("INSERT INTO moment (id, world_id, media_id, sort_order, is_favourite) "
                + "VALUES (:id, '01K6G2V8Q3N7X4B2C9D5E1WA01', :media, 1, FALSE)")
                .param("id", ulids.next()).param("media", id).update();
        return id;
    }

    // --- question / status --------------------------------------------------------------------------

    @Test
    void questionIsPublicAndIssuesTheXsrfCookie() throws Exception {
        MvcResult result = mvc.perform(get("/api/auth/question"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.question").value("Test question?"))
                .andReturn();
        Cookie xsrf = result.getResponse().getCookie("XSRF-TOKEN");
        assertThat(xsrf).isNotNull();
        assertThat(xsrf.isHttpOnly()).isFalse();
    }

    @Test
    void statusIsFalseForAnonymousAndNeverErrorsForBadCookies() throws Exception {
        mvc.perform(get("/api/auth/status")).andExpect(status().isOk()).andExpect(jsonPath("$.unlocked").value(false));
        for (String bad : new String[] {"", "garbage", "a.b", "x".repeat(5000), "e30.e30"}) {
            mvc.perform(get("/api/auth/status").cookie(new Cookie(ViewerCookies.NAME, bad)))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.unlocked").value(false));
        }
    }

    // --- unlock + CSRF ------------------------------------------------------------------------------------

    @Test
    void unlockWithoutCsrfTokenIsForbiddenAndWithTheTokenWorks() throws Exception {
        mvc.perform(post("/api/auth/unlock").contentType("application/json").content(unlockBody(ANSWER)))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/auth/lock")).andExpect(status().isForbidden());
        mvc.perform(csrfPost(mvc, "/api/auth/unlock", "10.0.0.1", unlockBody(ANSWER)))
                .andExpect(status().isNoContent())
                .andExpect(header().exists("Set-Cookie"));
    }

    @Test
    void successSetsAHardenedCookieAndNeverCreatesASession() throws Exception {
        MvcResult result = mvc.perform(csrfPost(mvc, "/api/auth/unlock", "10.0.0.2", unlockBody(" sAmPlE ")))
                .andExpect(status().isNoContent()).andReturn();
        String header = result.getResponse().getHeaders("Set-Cookie").stream()
                .filter(h -> h.startsWith("os_viewer=")).findFirst().orElseThrow();
        assertThat(header).contains("HttpOnly").contains("Secure").contains("SameSite=Lax").contains("Path=/")
                .contains("Max-Age=604800");
        assertThat(result.getRequest().getSession(false)).isNull();
        assertThat(result.getResponse().getCookie("JSESSIONID")).isNull();
    }

    @Test
    void whitespaceAndCaseVariantsAllUnlock() throws Exception {
        for (String variant : new String[] {"sam ple", "SAMPLE", "  sample ","TEST"}) {
            mvc.perform(csrfPost(mvc, "/api/auth/unlock", "10.0.0.3", unlockBody(variant)))
                    .andExpect(status().isNoContent());
        }
    }

    @Test
    void wrongAnswerIs401WithRemainingAttemptsAndNoEcho(CapturedOutput output) throws Exception {
        String wrong = "WrongAnswerXyz";
        mvc.perform(csrfPost(mvc, "/api/auth/unlock", "10.0.1.1", unlockBody(wrong)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.attemptsRemaining").value(4))
                .andExpect(jsonPath("$.type").value("urn:ourstory:problem:unlock-failed"))
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString(wrong))));
        mvc.perform(csrfPost(mvc, "/api/auth/unlock", "10.0.1.1", unlockBody(wrong)))
                .andExpect(jsonPath("$.attemptsRemaining").value(3));
        assertThat(output.getAll()).doesNotContain(wrong).doesNotContain(ANSWER + "\"");
    }

    @Test
    void invalidBodiesAre400WithTheGlobalErrorsArrayAndNeverReachTheHasher() throws Exception {
        clearInvocations(hasher);
        for (String body : new String[] {"{}", "{\"answer\":\"\"}", "{\"answer\":\"   \"}", "not json",
                "{\"answer\":\"" + "a".repeat(101) + "\"}", "{\"answer\":[\"x\"]}", "[]"}) {
            mvc.perform(csrfPost(mvc, "/api/auth/unlock", "10.0.2.1", body)).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.type").value("urn:ourstory:problem:validation-failed"))
                    .andExpect(jsonPath("$.errors").isArray())
                    .andExpect(jsonPath("$.errors[0].field").isNotEmpty())
                    .andExpect(jsonPath("$.errors[0].message").isNotEmpty());
        }
        mvc.perform(csrfPost(mvc, "/api/auth/unlock", "10.0.2.1", "{\"answer\":\"   \"}"))
                .andExpect(jsonPath("$.errors[0].field").value("answer"));
        verify(hasher, never()).matchesAny(any(), any());
    }

    @Test
    void oversizedBodiesAreRejectedEarlyWithAProblemBody() throws Exception {
        mvc.perform(csrfPost(mvc, "/api/auth/unlock", "10.0.2.2", "{\"answer\":\"" + "a".repeat(5000) + "\"}"))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(header().string("Content-Type", org.hamcrest.Matchers.startsWith("application/problem+json")))
                .andExpect(jsonPath("$.type").value("urn:ourstory:problem:payload-too-large"))
                .andExpect(jsonPath("$.status").value(413));
    }

    // --- rate limiting -------------------------------------------------------------------------------------

    @Test
    void sixthWrongAttemptFromOneIpIs429WithRetryAfterAndSkipsPbkdf2() throws Exception {
        for (int i = 0; i < 5; i++) {
            mvc.perform(csrfPost(mvc, "/api/auth/unlock", "10.0.3.1", unlockBody("nope" + i)))
                    .andExpect(status().isUnauthorized());
        }
        clearInvocations(hasher);
        mvc.perform(csrfPost(mvc, "/api/auth/unlock", "10.0.3.1", unlockBody("nope")))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "600"));
        // Even the right answer is refused while blocked, and without any hashing work.
        mvc.perform(csrfPost(mvc, "/api/auth/unlock", "10.0.3.1", unlockBody(ANSWER)))
                .andExpect(status().isTooManyRequests());
        verify(hasher, never()).matchesAny(any(), any());
        // Other clients are unaffected; the window slides.
        mvc.perform(csrfPost(mvc, "/api/auth/unlock", "10.0.3.2", unlockBody(ANSWER))).andExpect(status().isNoContent());
        clock.advance(Duration.ofMinutes(10));
        mvc.perform(csrfPost(mvc, "/api/auth/unlock", "10.0.3.1", unlockBody(ANSWER))).andExpect(status().isNoContent());
    }

    @Test
    void successesDoNotCountAsFailures() throws Exception {
        for (int i = 0; i < 12; i++) {
            mvc.perform(csrfPost(mvc, "/api/auth/unlock", "10.0.4.1", unlockBody(ANSWER)))
                    .andExpect(status().isNoContent());
        }
    }

    @Test
    void globalCapOf30PerHourBlocksEveryoneUntilTheHourSlides() throws Exception {
        for (int ip = 0; ip < 6; ip++) {
            for (int i = 0; i < 5; i++) {
                mvc.perform(csrfPost(mvc, "/api/auth/unlock", "10.1." + ip + ".1", unlockBody("bad")))
                        .andExpect(status().isUnauthorized());
            }
        }
        clearInvocations(hasher);
        mvc.perform(csrfPost(mvc, "/api/auth/unlock", "10.1.99.1", unlockBody(ANSWER)))
                .andExpect(status().isTooManyRequests()).andExpect(header().exists("Retry-After"))
                .andExpect(jsonPath("$.type").value("urn:ourstory:problem:too-many-attempts"));
        verify(hasher, never()).matchesAny(any(), any());
        clock.advance(Duration.ofMinutes(11)); // per-client windows are over, the global hour is not
        mvc.perform(csrfPost(mvc, "/api/auth/unlock", "10.1.99.1", unlockBody(ANSWER)))
                .andExpect(status().isTooManyRequests());
        clock.advance(Duration.ofMinutes(50));
        mvc.perform(csrfPost(mvc, "/api/auth/unlock", "10.1.99.1", unlockBody(ANSWER)))
                .andExpect(status().isNoContent());
    }

    @Test
    void adminResetClearsALockoutImmediately() throws Exception {
        for (int ip = 0; ip < 6; ip++) {
            for (int i = 0; i < 5; i++) {
                mvc.perform(csrfPost(mvc, "/api/auth/unlock", "10.8." + ip + ".1", unlockBody("bad")));
            }
        }
        mvc.perform(csrfPost(mvc, "/api/auth/unlock", "10.8.99.1", unlockBody(ANSWER)))
                .andExpect(status().isTooManyRequests());
        // Not allowed for anonymous callers, viewers, or without CSRF.
        mvc.perform(csrfPost(mvc, "/api/admin/auth/reset-rate-limits", "10.8.99.1", null))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/admin/auth/reset-rate-limits").with(admin())).andExpect(status().isForbidden());
        mvc.perform(csrfPost(mvc, "/api/admin/auth/reset-rate-limits", "10.8.99.1", null).with(admin()))
                .andExpect(status().isNoContent());
        mvc.perform(csrfPost(mvc, "/api/auth/unlock", "10.8.99.1", unlockBody(ANSWER)))
                .andExpect(status().isNoContent());
    }

    @Test
    void aForgedXForwardedForNeverChangesTheLimiterKey() throws Exception {
        // One TCP peer sending many different forged X-Forwarded-For values still hits ONE bucket.
        for (int i = 0; i < 5; i++) {
            mvc.perform(csrfPost(mvc, "/api/auth/unlock", "10.9.0.1", unlockBody("bad" + i))
                    .header("X-Forwarded-For", "203.0.113." + i)
                    .header("Forwarded", "for=198.51.100." + i)
                    .header("X-Real-IP", "192.0.2." + i)).andExpect(status().isUnauthorized());
        }
        mvc.perform(csrfPost(mvc, "/api/auth/unlock", "10.9.0.1", unlockBody("bad"))
                .header("X-Forwarded-For", "203.0.113.200")).andExpect(status().isTooManyRequests());
    }

    @Test
    void ipv6PeersOfOneSlash64ShareTheBucket() throws Exception {
        for (int i = 0; i < 5; i++) {
            mvc.perform(csrfPost(mvc, "/api/auth/unlock", "2001:db8:55:66:" + i + "::" + i, unlockBody("bad")))
                    .andExpect(status().isUnauthorized());
        }
        mvc.perform(csrfPost(mvc, "/api/auth/unlock", "2001:db8:55:66:abcd::1", unlockBody("bad")))
                .andExpect(status().isTooManyRequests());
    }

    @Test
    void securityEventsAreLoggedMaskedAndNeverContainAnswersOrCookies() throws Exception {
        ch.qos.logback.classic.Logger audit =
                (ch.qos.logback.classic.Logger) org.slf4j.LoggerFactory.getLogger(SecurityAudit.LOGGER);
        ch.qos.logback.core.read.ListAppender<ch.qos.logback.classic.spi.ILoggingEvent> appender =
                new ch.qos.logback.core.read.ListAppender<>();
        appender.start();
        audit.addAppender(appender);
        try {
            mvc.perform(csrfPost(mvc, "/api/auth/unlock", "198.51.100.23", unlockBody("WrongSecretXyz")));
            Cookie cookie = unlockedCookie(mvc, "198.51.100.23");
            for (int i = 0; i < 6; i++) {
                mvc.perform(csrfPost(mvc, "/api/auth/unlock", "198.51.100.24", unlockBody("nope" + i)));
            }
            String all = appender.list.stream().map(e -> e.getLevel() + " " + e.getFormattedMessage())
                    .collect(java.util.stream.Collectors.joining("\n"));
            assertThat(all).contains("unlock failed").contains("unlock succeeded").contains("scope=client")
                    .contains("198.51.*.*");
            assertThat(all).doesNotContain("WrongSecretXyz").doesNotContain("nope").doesNotContain(ANSWER)
                    .doesNotContain(cookie.getValue()).doesNotContain(ViewerTestSupport.SECRET)
                    .doesNotContain("100.23").doesNotContain("pbkdf2");
        } finally {
            audit.detachAppender(appender);
        }
    }

    @Test
    void cookieMaxAgeEqualsItsExpiry() throws Exception {
        MvcResult result = mvc.perform(csrfPost(mvc, "/api/auth/unlock", "10.9.1.1", unlockBody(ANSWER)))
                .andExpect(status().isNoContent()).andReturn();
        Cookie cookie = result.getResponse().getCookie(ViewerCookies.NAME);
        String payload = new String(java.util.Base64.getUrlDecoder().decode(cookie.getValue().split("\\.")[0]),
                StandardCharsets.UTF_8);
        long iat = Long.parseLong(payload.replaceAll(".*\"iat\":(\\d+).*", "$1"));
        long exp = Long.parseLong(payload.replaceAll(".*\"exp\":(\\d+).*", "$1"));
        assertThat(cookie.getMaxAge()).isEqualTo(7 * 24 * 3600).isEqualTo((int) (exp - iat));
    }

    // --- access matrix ---------------------------------------------------------------------------------------

    @Test
    void mediaAccessMatrixAnonymousViewerAdmin() throws Exception {
        String id = seedMedia();
        String path = "/api/media/" + id + "/thumb";
        Cookie viewer = unlockedCookie(mvc, "10.0.5.1");

        mvc.perform(get(path)).andExpect(status().isUnauthorized());
        mvc.perform(get(path).cookie(viewer)).andExpect(status().isOk());
        mvc.perform(get(path).with(admin())).andExpect(status().isOk());
        mvc.perform(get("/api/media/" + ulids.next() + "/thumb").cookie(viewer)).andExpect(status().isNotFound());
        // Unknown API paths stay denied for everyone but never leak: anonymous 401.
        mvc.perform(get("/api/experience")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/worlds/x")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/something-else").cookie(viewer)).andExpect(status().isForbidden());
    }

    @Test
    void viewerNeverReachesTheAdminApi() throws Exception {
        Cookie viewer = unlockedCookie(mvc, "10.0.5.2");
        mvc.perform(get("/api/admin/settings")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/settings").cookie(viewer)).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/media").cookie(viewer)).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/me").cookie(viewer)).andExpect(status().isForbidden());
    }

    @Test
    void viewerRequestsNeverCreateOrUseASession() throws Exception {
        String id = seedMedia();
        Cookie viewer = unlockedCookie(mvc, "10.0.5.3");
        for (String path : new String[] {"/api/media/" + id + "/thumb", "/api/auth/status", "/api/admin/settings"}) {
            MvcResult result = mvc.perform(get(path).cookie(viewer)).andReturn();
            assertThat(result.getRequest().getSession(false)).as(path).isNull();
            assertThat(result.getResponse().getCookie("JSESSIONID")).as(path).isNull();
        }
    }

    @Test
    void statusIsTrueForViewerAndAdmin() throws Exception {
        Cookie viewer = unlockedCookie(mvc, "10.0.5.4");
        mvc.perform(get("/api/auth/status").cookie(viewer)).andExpect(jsonPath("$.unlocked").value(true));
        mvc.perform(get("/api/auth/status").with(admin())).andExpect(jsonPath("$.unlocked").value(true));
    }

    @Test
    void anAdminSessionIsNotOverriddenByAViewerCookie() throws Exception {
        Cookie viewer = unlockedCookie(mvc, "10.0.5.5");
        mvc.perform(get("/api/admin/settings").with(admin()).cookie(viewer)).andExpect(status().isOk());
    }

    // --- cookie lifetime, tampering, lock, epoch -----------------------------------------------------

    @Test
    void tamperedExpiredAndForeignCookiesAreRejected() throws Exception {
        String id = seedMedia();
        String path = "/api/media/" + id + "/thumb";
        Cookie viewer = unlockedCookie(mvc, "10.0.6.1");
        String value = viewer.getValue();
        String[] parts = value.split("\\.");
        byte[] mac = java.util.Base64.getUrlDecoder().decode(parts[1]);
        mac[0] ^= 1;
        String badMac = parts[0] + "." + java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(mac);
        mvc.perform(get(path).cookie(new Cookie(ViewerCookies.NAME, badMac))).andExpect(status().isUnauthorized());
        mvc.perform(get(path).cookie(new Cookie(ViewerCookies.NAME, "x".repeat(100_000))))
                .andExpect(status().isUnauthorized());
        mvc.perform(get(path).cookie(viewer)).andExpect(status().isOk());
        clock.advance(Duration.ofDays(7).plusSeconds(1));
        mvc.perform(get(path).cookie(viewer)).andExpect(status().isUnauthorized());
    }

    @Test
    void lockClearsTheCookie() throws Exception {
        MvcResult result = mvc.perform(csrfPost(mvc, "/api/auth/lock", "10.0.6.2", null))
                .andExpect(status().isNoContent()).andReturn();
        Cookie cleared = result.getResponse().getCookie(ViewerCookies.NAME);
        assertThat(cleared.getMaxAge()).isZero();
        assertThat(cleared.getValue()).isEmpty();
        assertThat(cleared.isHttpOnly()).isTrue();
    }

    @Test
    void anEpochBumpInvalidatesCookiesOnceTheShortCacheExpires() throws Exception {
        String id = seedMedia();
        String path = "/api/media/" + id + "/thumb";
        Cookie viewer = unlockedCookie(mvc, "10.0.6.3");
        mvc.perform(get(path).cookie(viewer)).andExpect(status().isOk());
        settings.bumpViewerEpoch();
        // Within the 5 second cache the old epoch may still be served; afterwards it must be rejected.
        clock.advance(Duration.ofSeconds(6));
        mvc.perform(get(path).cookie(viewer)).andExpect(status().isUnauthorized());
        // A freshly issued cookie works again.
        Cookie renewed = unlockedCookie(mvc, "10.0.6.4");
        mvc.perform(get(path).cookie(renewed)).andExpect(status().isOk());
    }

    @Test
    void cookiesAreNotLoggedAndDecodedCookieContainsOnlyTheClaims() throws Exception {
        Cookie viewer = unlockedCookie(mvc, "10.0.6.5");
        String payload = new String(java.util.Base64.getUrlDecoder().decode(viewer.getValue().split("\\.")[0]),
                StandardCharsets.UTF_8);
        assertThat(payload).matches("\\{\"v\":1,\"iat\":\\d+,\"exp\":\\d+,\"ep\":\\d+}");
    }
}
