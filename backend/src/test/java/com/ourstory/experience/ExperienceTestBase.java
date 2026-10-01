package com.ourstory.experience;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ourstory.TestSupport;
import com.ourstory.common.UlidGenerator;
import com.ourstory.content.Letter;
import com.ourstory.content.LetterRepository;
import com.ourstory.content.Moment;
import com.ourstory.content.MomentRepository;
import com.ourstory.content.RevealTrigger;
import com.ourstory.content.World;
import com.ourstory.content.WorldLayout;
import com.ourstory.content.WorldRepository;
import com.ourstory.media.MediaRecord;
import com.ourstory.media.MediaRepository;
import com.ourstory.media.MediaSize;
import com.ourstory.media.MediaStorage;
import com.ourstory.settings.SettingKeys;
import com.ourstory.settings.SettingsService;
import jakarta.servlet.http.Cookie;
import java.awt.Color;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/**
 * Real H2 + Flyway, real file storage, real security chain (real unlock cookie, real CSRF) and a settable
 * clock. Every test starts at 2026-10-01 and leaves the six seeded worlds exactly as migrated.
 */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:ourstory-experience;DB_CLOSE_DELAY=-1",
        "ourstory.viewer.unlock-question=Test question?",
        "ourstory.viewer.unlock-answers=Sample",
        "ourstory.viewer.pbkdf2-iterations=1000",
        "ourstory.viewer-cookie-secret=0123456789012345678901234567890123456789"})
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(ExperienceTestConfig.class)
abstract class ExperienceTestBase {

    static final String ONE = "01K6G2V8Q3N7X4B2C9D5E1WA01";
    static final String FIRSTS = "01K6G2V8Q4R1M9T6H3J8F5ZB02";
    static final String QUESTION = "01K6G2V8Q7V4R9A3N6J1Q8CE05";
    static final String FOREVER = "01K6G2V8Q8W5S0B4P7K2R9DF06";
    static final List<String> SEED_SLUGS = List.of("where-it-all-began", "our-firsts", "adventures-together",
            "little-everyday-moments", "the-question", "our-forever");
    static final Instant FOREVER_UNLOCK = OffsetDateTime.parse("2027-02-14T00:00:00+05:30").toInstant();
    static final Instant START = Instant.parse("2026-10-01T00:00:00Z");

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired ExperienceTestConfig.SettableClock clock;
    @Autowired JdbcClient jdbc;
    @Autowired UlidGenerator ulids;
    @Autowired MediaRepository media;
    @Autowired MediaStorage storage;
    @Autowired WorldRepository worlds;
    @Autowired MomentRepository moments;
    @Autowired LetterRepository letters;
    @Autowired SettingsService settings;

    private final List<String> createdMedia = new ArrayList<>();

    @BeforeEach
    void startClock() {
        clock.set(START);
    }

    @AfterEach
    void restoreSeedData() {
        jdbc.sql("DELETE FROM letter").update();
        jdbc.sql("DELETE FROM moment").update();
        jdbc.sql("SELECT id FROM world").query(String.class).list().stream()
                .filter(id -> !SEED_SLUGS.contains(slugOf(id))).forEach(worlds::delete);
        createdMedia.forEach(id -> {
            storage.deleteAll(id);
            media.deleteById(id);
        });
        createdMedia.clear();
        jdbc.sql("UPDATE world SET cover_media_id = NULL, published = TRUE, unlock_at = NULL").update();
        jdbc.sql("UPDATE world SET unlock_at = :at WHERE id = :id")
                .param("at", FOREVER_UNLOCK.atOffset(ZoneOffset.UTC)).param("id", FOREVER).update();
        settings.applyUpdate(Map.of(SettingKeys.HERO_MEDIA_IDS, "[]"), null);
    }

    private String slugOf(String id) {
        return jdbc.sql("SELECT slug FROM world WHERE id = :id").param("id", id).query(String.class).single();
    }

    // --- data builders -------------------------------------------------------------------------------

    /** A media row (never any file). */
    String newMedia() {
        String id = ulids.next();
        media.insert(new MediaRecord(id, "g-" + id, "image/jpeg", 400, 300, null, "a.jpg",
                "data:image/jpeg;base64,AA==", "#112233", OffsetDateTime.now(ZoneOffset.UTC).truncatedTo(ChronoUnit.MILLIS)));
        createdMedia.add(id);
        return id;
    }

    /** A media row with a real thumb file on disk, written through MediaStorage. */
    String newMediaWithFile() throws Exception {
        String id = newMedia();
        storage.write(id, MediaSize.THUMB, TestSupport.jpeg(Color.PINK, 8, 8));
        return id;
    }

    World newWorld(String slug, int sortOrder, boolean published, Instant unlockAt, String coverMediaId) {
        World w = new World(ulids.next(), slug, "Title " + slug, "sub " + slug, "tag " + slug,
                WorldLayout.POSTCARDS, coverMediaId, "#aa0000", sortOrder, unlockAt, "intro " + slug,
                "outro " + slug, "https://example.com/m.mp3", published, Instant.now(), Instant.now());
        worlds.insert(w);
        return w;
    }

    void place(String worldId, String... mediaIds) {
        List<Moment> list = new ArrayList<>();
        for (String mediaId : mediaIds) {
            list.add(new Moment(ulids.next(), worldId, mediaId, "cap " + mediaId, "note", null, null, 0, false));
        }
        moments.replaceAll(worldId, list);
    }

    String idOfSeed(String slug) {
        return worlds.findBySlug(slug).orElseThrow().id();
    }

    void addLetter(String worldId, String title, String body, int sort) {
        letters.insert(new Letter(ulids.next(), worldId, title, body, RevealTrigger.WORLD_OUTRO, sort,
                Instant.now()));
    }

    void setHero(String... ids) throws Exception {
        settings.applyUpdate(Map.of(SettingKeys.HERO_MEDIA_IDS, json.writeValueAsString(List.of(ids))), null);
    }

    // --- callers --------------------------------------------------------------------------------------

    /** Real unlock (GET for the XSRF token, then POST with header + cookie); returns the os_viewer cookie. */
    Cookie viewer() throws Exception {
        String token = mvc.perform(get("/api/auth/status")).andReturn().getResponse().getCookie("XSRF-TOKEN")
                .getValue();
        return mvc.perform(post("/api/auth/unlock").cookie(new Cookie("XSRF-TOKEN", token))
                        .header("X-XSRF-TOKEN", token).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"answer\":\"Sample\"}".getBytes(StandardCharsets.UTF_8)))
                .andExpect(status().isNoContent()).andReturn().getResponse().getCookie("os_viewer");
    }

    static RequestPostProcessor admin() {
        return oidcLogin().idToken(t -> t.claim("email", "me@example.com"))
                .authorities(new SimpleGrantedAuthority("ROLE_ADMIN"));
    }

    // --- assertions helpers ---------------------------------------------------------------------------

    JsonNode body(MvcResult result) throws Exception {
        return json.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    /** Problem body without the request-specific "instance" member (so two 404s can be compared). */
    JsonNode problem(MvcResult result) throws Exception {
        com.fasterxml.jackson.databind.node.ObjectNode node = (com.fasterxml.jackson.databind.node.ObjectNode) body(result);
        node.remove("instance");
        return node;
    }

    static Set<String> fields(JsonNode node) {
        Set<String> names = new TreeSet<>();
        node.fieldNames().forEachRemaining(names::add);
        return names;
    }

    static Set<String> set(String... names) {
        return new TreeSet<>(Set.of(names));
    }
}
