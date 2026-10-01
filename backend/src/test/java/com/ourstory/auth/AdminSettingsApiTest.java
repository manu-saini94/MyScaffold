package com.ourstory.auth;

import static com.ourstory.auth.ViewerTestSupport.ANSWER;
import static com.ourstory.auth.ViewerTestSupport.admin;
import static com.ourstory.auth.ViewerTestSupport.csrfPost;
import static com.ourstory.auth.ViewerTestSupport.csrfPut;
import static com.ourstory.auth.ViewerTestSupport.unlockBody;
import static com.ourstory.auth.ViewerTestSupport.unlockedCookie;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ourstory.settings.SettingsService;
import jakarta.servlet.http.Cookie;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/** /api/admin/settings over the real chain: secrets stay secret and credential changes end viewer sessions. */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:ourstory-admin-settings;DB_CLOSE_DELAY=-1",
        "ourstory.viewer.unlock-question=Test question?",
        "ourstory.viewer.unlock-answers=Sample,test",
        "ourstory.viewer.pbkdf2-iterations=1000",
        "ourstory.viewer-cookie-secret=" + ViewerTestSupport.SECRET})
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(ViewerTestSupport.ClockConfig.class)
class AdminSettingsApiTest {

    private static final String MEDIA = "/api/media/01HZX0000000000000000000AB/thumb";

    @Autowired MockMvc mvc;
    @Autowired MutableClock clock;
    @Autowired SettingsService settings;
    @Autowired ObjectMapper mapper;

    @BeforeEach
    void freshWindow() {
        clock.advance(Duration.ofMinutes(61));
    }

    private JsonNode getSettings() throws Exception {
        String body = mvc.perform(get("/api/admin/settings").with(admin())).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return mapper.readTree(body);
    }

    @Test
    void requiresAdminAndCsrf() throws Exception {
        Cookie viewer = unlockedCookie(mvc, "10.2.0.1");
        mvc.perform(get("/api/admin/settings")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/settings").cookie(viewer)).andExpect(status().isForbidden());
        mvc.perform(csrfPut(mvc, "/api/admin/settings", "{}").cookie(viewer)).andExpect(status().isForbidden());
        mvc.perform(put("/api/admin/settings").with(admin()).contentType("application/json").content("{}"))
                .andExpect(status().isForbidden());
        mvc.perform(csrfPost(mvc, "/api/admin/settings/sign-out-everyone", "10.2.0.1", null).cookie(viewer))
                .andExpect(status().isForbidden());
        mvc.perform(csrfPost(mvc, "/api/admin/settings/sign-out-everyone", "10.2.0.1", null))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void getReturnsSettingsButNeverAnswersOrHashes() throws Exception {
        String raw = mvc.perform(get("/api/admin/settings").with(admin())).andReturn().getResponse()
                .getContentAsString(StandardCharsets.UTF_8);
        JsonNode node = mapper.readTree(raw);
        assertThat(node.get("appTitle").asText()).isEqualTo("Anvi ❤ Manu");
        assertThat(node.get("defaultTheme").asText()).isEqualTo("rose");
        assertThat(node.get("unlockQuestion").asText()).isEqualTo("Test question?");
        assertThat(node.get("unlockAnswersConfigured").asInt()).isEqualTo(2);
        assertThat(node.get("easterEggNicknames").get(0).asText()).isEqualTo("anvi");
        assertThat(raw).doesNotContain("pbkdf2").doesNotContain("unlockAnswers\"").doesNotContain("hash")
                .doesNotContainIgnoringCase("sample");
    }

    @Test
    void partialUpdateChangesOnlyTheGivenKeysAndKeepsViewersSignedIn() throws Exception {
        Cookie viewer = unlockedCookie(mvc, "10.2.1.1");
        mvc.perform(csrfPut(mvc, "/api/admin/settings",
                        "{\"tagline\":\"Forever ❤\",\"defaultTheme\":\"cinema\"}").with(admin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.defaultTheme").value("cinema"));
        JsonNode now = getSettings();
        assertThat(now.get("tagline").asText()).isEqualTo("Forever ❤");
        assertThat(now.get("herName").asText()).isEqualTo("Anvi");
        mvc.perform(get(MEDIA).cookie(viewer)).andExpect(status().isNotFound()); // authorised (no such media)
        mvc.perform(csrfPut(mvc, "/api/admin/settings", "{\"defaultTheme\":\"rose\"}").with(admin()))
                .andExpect(status().isOk());
    }

    @Test
    void invalidAndUnknownKeysAre400WithFieldErrorsAndNothingIsWritten() throws Exception {
        mvc.perform(csrfPut(mvc, "/api/admin/settings",
                        "{\"tagline\":\"changed\",\"defaultTheme\":\"neon\",\"bogus\":1,\"specialDate\":\"x\"}")
                        .with(admin()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors").isArray())
                .andExpect(jsonPath("$.errors[?(@.field=='defaultTheme')]").exists())
                .andExpect(jsonPath("$.errors[?(@.field=='bogus')].message").value("Unknown setting"))
                .andExpect(jsonPath("$.errors[?(@.field=='specialDate')]").exists())
                .andExpect(jsonPath("$.type").value("urn:ourstory:problem:validation-failed"));
        assertThat(settings.tagline()).isNotEqualTo("changed");
        mvc.perform(csrfPut(mvc, "/api/admin/settings", "[1]").with(admin())).andExpect(status().isBadRequest());
        mvc.perform(csrfPut(mvc, "/api/admin/settings", "{\"viewer_epoch\":\"9\"}").with(admin()))
                .andExpect(status().isBadRequest());
        mvc.perform(csrfPut(mvc, "/api/admin/settings", "{\"unlock_answer_hashes\":[\"x\"]}").with(admin()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void invalidAnswersAreRejected() throws Exception {
        for (String body : new String[] {"{\"unlockAnswers\":[]}", "{\"unlockAnswers\":\"Sample\"}",
                "{\"unlockAnswers\":[\"\"]}", "{\"unlockAnswers\":[1]}", "{\"unlockAnswers\":[\"abc\"]}",
                "{\"unlockAnswers\":[\"a b c\"]}",
                "{\"unlockAnswers\":[\"a\",\"b\",\"c\",\"d\",\"e\",\"f\",\"g\",\"h\",\"i\",\"j\",\"k\"]}"}) {
            mvc.perform(csrfPut(mvc, "/api/admin/settings", body).with(admin()))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.errors[?(@.field=='unlockAnswers')]").exists());
        }
        assertThat(settings.unlockAnswerHashes()).hasSize(2);
    }

    @Test
    void changingAnswersReplacesThemHashedAndSignsEveryoneOut() throws Exception {
        Cookie viewer = unlockedCookie(mvc, "10.2.2.1");
        mvc.perform(get(MEDIA).cookie(viewer)).andExpect(status().isNotFound());
        mvc.perform(csrfPut(mvc, "/api/admin/settings", "{\"unlockAnswers\":[\"New Answer\",\"other\"]}")
                        .with(admin()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.unlockAnswersConfigured").value(2));
        assertThat(settings.unlockAnswerHashes()).allMatch(h -> h.startsWith("pbkdf2-sha256-p1$"))
                .noneMatch(h -> h.toLowerCase().contains("newanswer"));
        mvc.perform(get(MEDIA).cookie(viewer)).andExpect(status().isUnauthorized());
        mvc.perform(csrfPost(mvc, "/api/auth/unlock", "10.2.2.2", unlockBody(ANSWER)))
                .andExpect(status().isUnauthorized());
        mvc.perform(csrfPost(mvc, "/api/auth/unlock", "10.2.2.2", unlockBody("newanswer")))
                .andExpect(status().isNoContent());
        // restore for other tests
        mvc.perform(csrfPut(mvc, "/api/admin/settings", "{\"unlockAnswers\":[\"Sample\",\"test\"]}").with(admin()))
                .andExpect(status().isOk());
    }

    @Test
    void changingTheQuestionSignsEveryoneOutAndShowsTheNewQuestion() throws Exception {
        Cookie viewer = unlockedCookie(mvc, "10.2.3.1");
        mvc.perform(csrfPut(mvc, "/api/admin/settings", "{\"unlockQuestion\":\"A new question?\"}").with(admin()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.unlockQuestion").value("A new question?"));
        mvc.perform(get("/api/auth/question")).andExpect(jsonPath("$.question").value("A new question?"));
        mvc.perform(get(MEDIA).cookie(viewer)).andExpect(status().isUnauthorized());
        mvc.perform(csrfPut(mvc, "/api/admin/settings", "{\"unlockQuestion\":\"Test question?\"}").with(admin()))
                .andExpect(status().isOk());
    }

    @Test
    void signOutEveryoneBumpsTheEpoch() throws Exception {
        Cookie viewer = unlockedCookie(mvc, "10.2.4.1");
        mvc.perform(get(MEDIA).cookie(viewer)).andExpect(status().isNotFound());
        long before = settings.viewerEpoch();
        mvc.perform(csrfPost(mvc, "/api/admin/settings/sign-out-everyone", "10.2.4.1", null).with(admin()))
                .andExpect(status().isNoContent());
        assertThat(settings.viewerEpoch()).isEqualTo(before + 1);
        mvc.perform(get(MEDIA).cookie(viewer)).andExpect(status().isUnauthorized());
    }

    @Test
    void writingTheSameQuestionOrAnswersDoesNotSignAnyoneOut() throws Exception {
        Cookie viewer = unlockedCookie(mvc, "10.2.5.1");
        long before = settings.viewerEpoch();
        mvc.perform(csrfPut(mvc, "/api/admin/settings",
                        "{\"unlockQuestion\":\"Test question?\",\"unlockAnswers\":[\" SAMPLE \",\"Test\"]}")
                        .with(admin()))
                .andExpect(status().isOk());
        assertThat(settings.viewerEpoch()).isEqualTo(before);
        mvc.perform(get(MEDIA).cookie(viewer)).andExpect(status().isNotFound()); // still authorised
        // A genuinely different answer set does bump the epoch.
        mvc.perform(csrfPut(mvc, "/api/admin/settings", "{\"unlockAnswers\":[\"Sample\"]}").with(admin()))
                .andExpect(status().isOk());
        assertThat(settings.viewerEpoch()).isGreaterThan(before);
        mvc.perform(csrfPut(mvc, "/api/admin/settings", "{\"unlockAnswers\":[\"Sample\",\"test\"]}").with(admin()))
                .andExpect(status().isOk());
    }

    @Test
    void heroMediaIdsMustBeUniqueAndExist() throws Exception {
        String ghost = "01HZX0000000000000000000AB";
        mvc.perform(csrfPut(mvc, "/api/admin/settings", "{\"heroMediaIds\":[\"" + ghost + "\"]}").with(admin()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[?(@.field=='heroMediaIds')].message").value("Some photos do not exist"));
        mvc.perform(csrfPut(mvc, "/api/admin/settings",
                        "{\"heroMediaIds\":[\"" + ghost + "\",\"" + ghost + "\"]}").with(admin()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[?(@.field=='heroMediaIds')].message").value("Entries must be unique"));
        mvc.perform(csrfPut(mvc, "/api/admin/settings", "{\"heroMediaIds\":[]}").with(admin()))
                .andExpect(status().isOk());
    }

    @Test
    void settingsChangesAreLoggedByKeyNameOnly() throws Exception {
        ch.qos.logback.classic.Logger audit =
                (ch.qos.logback.classic.Logger) org.slf4j.LoggerFactory.getLogger(SecurityAudit.LOGGER);
        ch.qos.logback.core.read.ListAppender<ch.qos.logback.classic.spi.ILoggingEvent> appender =
                new ch.qos.logback.core.read.ListAppender<>();
        appender.start();
        audit.addAppender(appender);
        try {
            mvc.perform(csrfPut(mvc, "/api/admin/settings",
                    "{\"tagline\":\"A very private tagline\",\"unlockAnswers\":[\"Brand New Answer\"]}").with(admin()))
                    .andExpect(status().isOk());
            mvc.perform(csrfPost(mvc, "/api/admin/settings/sign-out-everyone", "10.2.6.1", null).with(admin()))
                    .andExpect(status().isNoContent());
            mvc.perform(csrfPut(mvc, "/api/admin/settings", "{\"unlockAnswers\":[\"Sample\",\"test\"],"
                    + "\"tagline\":\"Love you till eternity and back\"}").with(admin())).andExpect(status().isOk());
            String all = appender.list.stream().map(e -> e.getFormattedMessage())
                    .collect(java.util.stream.Collectors.joining(", "));
            assertThat(all).contains("admin settings changed keys=[tagline, unlockAnswers]")
                    .contains("signed out every viewer");
            assertThat(all).doesNotContain("private tagline").doesNotContain("Brand New").doesNotContain("brandnew")
                    .doesNotContain("pbkdf2");
        } finally {
            audit.detachAppender(appender);
        }
    }
}
