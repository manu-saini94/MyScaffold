package com.ourstory.experience;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import jakarta.servlet.http.Cookie;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The number of SQL statements must not grow with the number of worlds or moments (no N+1). */
class ExperienceQueryCountTest extends ExperienceTestBase {

    private static final int CEILING = 20;

    private int statementsFor(String path, Cookie cookie) throws Exception {
        mvc.perform(get(path).cookie(cookie)).andReturn(); // warm-up (epoch cache etc.)
        ExperienceTestConfig.STATEMENTS.set(0);
        mvc.perform(get(path).cookie(cookie)).andReturn();
        return ExperienceTestConfig.STATEMENTS.get();
    }

    private void fillSeedWorlds(int momentsPerWorld) {
        for (String slug : SEED_SLUGS) {
            List<String> ids = new ArrayList<>();
            for (int i = 0; i < momentsPerWorld; i++) {
                ids.add(newMedia());
            }
            place(idOfSeed(slug), ids.toArray(String[]::new));
        }
    }

    @Test
    void experienceUsesTheSameStatementsForTwoMomentsAndForFortyPerWorld() throws Exception {
        Cookie cookie = viewer();
        fillSeedWorlds(2);
        int small = statementsFor("/api/experience", cookie);

        fillSeedWorlds(40);
        int large = statementsFor("/api/experience", cookie);

        assertThat(small).isPositive().isLessThanOrEqualTo(CEILING);
        assertThat(large).isEqualTo(small);
    }

    @Test
    void worldDetailUsesTheSameStatementsRegardlessOfMomentCount() throws Exception {
        Cookie cookie = viewer();
        fillSeedWorlds(1);
        int small = statementsFor("/api/worlds/where-it-all-began", cookie);

        fillSeedWorlds(60);
        int large = statementsFor("/api/worlds/where-it-all-began", cookie);

        assertThat(small).isPositive().isLessThanOrEqualTo(CEILING);
        assertThat(large).isEqualTo(small);
    }

    @Test
    void experienceStatementCountDoesNotGrowWithTheNumberOfWorlds() throws Exception {
        Cookie cookie = viewer();
        jdbc.sql("UPDATE world SET cover_media_id = :c WHERE id = :id").param("c", newMedia()).param("id", ONE)
                .update(); // an empty card lookup is skipped entirely, so start with one cover
        int few = statementsFor("/api/experience", cookie);

        for (int i = 0; i < 20; i++) {
            newWorld("extra-" + i, 10 + i, true, null, newMedia());
        }
        int many = statementsFor("/api/experience", cookie);

        assertThat(many).isEqualTo(few);
    }

    @Test
    void mediaRequestUsesOneVisibilityQueryPlusOneLookup() throws Exception {
        Cookie cookie = viewer();
        String id = newMediaWithFile();
        place(ONE, id);

        int count = statementsFor("/api/media/" + id + "/thumb", cookie);

        assertThat(count).isEqualTo(2);
    }
}
