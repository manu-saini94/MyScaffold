package com.ourstory.content;

import com.ourstory.common.UlidGenerator;
import com.ourstory.media.MediaRecord;
import com.ourstory.media.MediaRepository;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.AfterEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;

/** Real H2 + Flyway context. Cleans up everything a test created but keeps the six seeded worlds. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
abstract class ContentTestBase {

    static final Set<String> SEED_IDS = Set.of("01K6G2V8Q3N7X4B2C9D5E1WA01", "01K6G2V8Q4R1M9T6H3J8F5ZB02",
            "01K6G2V8Q5S2P7Y1K4G9N6AC03", "01K6G2V8Q6T3Q8Z2M5H0P7BD04", "01K6G2V8Q7V4R9A3N6J1Q8CE05",
            "01K6G2V8Q8W5S0B4P7K2R9DF06");

    @Autowired JdbcClient jdbc;
    @Autowired UlidGenerator ulids;
    @Autowired MediaRepository media;
    @Autowired WorldRepository worlds;
    @Autowired MomentRepository moments;
    @Autowired LetterRepository letters;

    private final List<String> createdMedia = new ArrayList<>();

    @AfterEach
    void cleanContent() {
        jdbc.sql("DELETE FROM letter").update();
        jdbc.sql("DELETE FROM moment").update();
        jdbc.sql("SELECT id FROM world").query(String.class).list().stream()
                .filter(id -> !SEED_IDS.contains(id)).forEach(worlds::delete);
        createdMedia.forEach(id -> jdbc.sql("DELETE FROM media WHERE id = :id").param("id", id).update());
        createdMedia.clear();
        jdbc.sql("UPDATE world SET cover_media_id = NULL, published = TRUE").update();
    }

    String seedMedia() {
        String id = ulids.next();
        media.insert(new MediaRecord(id, "g-" + id, "image/jpeg", 400, 300, null, "a.jpg", "data:image/jpeg;base64,AA==",
                "#112233", OffsetDateTime.now(ZoneOffset.UTC).truncatedTo(ChronoUnit.MILLIS)));
        createdMedia.add(id);
        return id;
    }

    World newWorld(String slug, int sortOrder) {
        World w = new World(ulids.next(), slug, "Title " + slug, "sub", "tag", WorldLayout.POSTCARDS, null,
                "#aa0000", sortOrder, null, "intro", "outro", null, true, Instant.now(), Instant.now());
        worlds.insert(w);
        return w;
    }

    Moment moment(String worldId, String mediaId, String caption) {
        return new Moment(ulids.next(), worldId, mediaId, caption, null, null, null, 0, false);
    }
}
