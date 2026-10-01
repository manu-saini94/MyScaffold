package com.ourstory.experience;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ourstory.common.UlidGenerator;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

/** Media policy matrix over real files, the real security chain and a moving clock. */
class MediaVisibilityTest extends ExperienceTestBase {

    private int thumb(String id, Cookie cookie) throws Exception {
        return mvc.perform(get("/api/media/" + id + "/thumb").cookie(cookie)).andReturn().getResponse().getStatus();
    }

    @Test
    void viewerReadsMediaOfAnOpenWorldWithEtagAnd304() throws Exception {
        String id = newMediaWithFile();
        place(ONE, id);
        Cookie cookie = viewer();

        MvcResult ok = mvc.perform(get("/api/media/" + id + "/thumb").cookie(cookie)).andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/jpeg"))
                .andExpect(header().string("Cache-Control", "max-age=31536000, private, immutable")).andReturn();
        String etag = ok.getResponse().getHeader("ETag");

        assertThat(ok.getResponse().getContentAsByteArray()).isNotEmpty();
        assertThat(etag).startsWith("\"");
        mvc.perform(get("/api/media/" + id + "/thumb").cookie(cookie).header("If-None-Match", etag))
                .andExpect(status().isNotModified());
    }

    @Test
    void viewerReadsTheCoverOfAnOpenWorldEvenWithoutMoments() throws Exception {
        String cover = newMediaWithFile();
        jdbc.sql("UPDATE world SET cover_media_id = :c WHERE id = :id").param("c", cover).param("id", ONE).update();

        assertThat(thumb(cover, viewer())).isEqualTo(200);
    }

    @Test
    void mediaOnlyInALockedWorldIs404ForViewersButAdminsMayRead() throws Exception {
        String id = newMediaWithFile();
        place(FOREVER, id);

        assertThat(thumb(id, viewer())).isEqualTo(404);
        mvc.perform(get("/api/media/" + id + "/thumb").with(admin())).andExpect(status().isOk());
    }

    @Test
    void coverOfALockedWorldIs404ForViewers() throws Exception {
        String cover = newMediaWithFile();
        jdbc.sql("UPDATE world SET cover_media_id = :c WHERE id = :id").param("c", cover).param("id", FOREVER)
                .update();

        assertThat(thumb(cover, viewer())).isEqualTo(404);
    }

    @Test
    void mediaOfAnUnpublishedWorldIs404ForViewersAndReadableByAdmin() throws Exception {
        String id = newMediaWithFile();
        String cover = newMediaWithFile();
        newWorld("draft", 30, false, null, cover);
        place(worlds.findBySlug("draft").orElseThrow().id(), id);

        Cookie cookie = viewer();
        assertThat(thumb(id, cookie)).isEqualTo(404);
        assertThat(thumb(cover, cookie)).isEqualTo(404);
        mvc.perform(get("/api/media/" + id + "/thumb").with(admin())).andExpect(status().isOk());
    }

    @Test
    void mediaInBothAnOpenAndALockedWorldStaysReadable() throws Exception {
        String id = newMediaWithFile();
        place(ONE, id);
        place(FOREVER, id);

        assertThat(thumb(id, viewer())).isEqualTo(200);
    }

    @Test
    void heroListingNeverGrantsAccessByItself() throws Exception {
        String orphan = newMediaWithFile();
        String inLocked = newMediaWithFile();
        String inOpen = newMediaWithFile();
        place(FOREVER, inLocked);
        place(ONE, inOpen);
        setHero(orphan, inLocked, inOpen);
        Cookie cookie = viewer();

        assertThat(thumb(orphan, cookie)).isEqualTo(404);
        assertThat(thumb(inLocked, cookie)).isEqualTo(404);
        assertThat(thumb(inOpen, cookie)).isEqualTo(200);
    }

    @Test
    void notVisibleAndNonexistentAreIdentical404s() throws Exception {
        String hidden = newMediaWithFile();
        place(FOREVER, hidden);
        Cookie cookie = viewer();

        MvcResult hiddenResult = mvc.perform(get("/api/media/" + hidden + "/thumb").cookie(cookie)).andReturn();
        MvcResult missing = mvc.perform(get("/api/media/" + new UlidGenerator().next() + "/thumb").cookie(cookie))
                .andReturn();

        assertThat(hiddenResult.getResponse().getStatus()).isEqualTo(404);
        assertThat(missing.getResponse().getStatus()).isEqualTo(404);
        assertThat(problem(hiddenResult)).isEqualTo(problem(missing));
        assertThat(hiddenResult.getResponse().getHeader("ETag")).isNull();
    }

    @Test
    void anAdminReadsMediaThatBelongsToNoWorld() throws Exception {
        String id = newMediaWithFile();

        mvc.perform(get("/api/media/" + id + "/thumb").with(admin())).andExpect(status().isOk());
        assertThat(thumb(id, viewer())).isEqualTo(404);
    }

    @Test
    void anonymousIs401() throws Exception {
        String id = newMediaWithFile();
        place(ONE, id);

        mvc.perform(get("/api/media/" + id + "/thumb")).andExpect(status().isUnauthorized());
    }

    @Test
    void visibilityFollowsTheClockOnEveryRequest() throws Exception {
        String id = newMediaWithFile();
        place(FOREVER, id);

        clock.set(FOREVER_UNLOCK.minusSeconds(1));
        Cookie cookie = viewer();
        assertThat(thumb(id, cookie)).isEqualTo(404);

        clock.set(FOREVER_UNLOCK);
        assertThat(thumb(id, cookie)).isEqualTo(200);

        clock.set(Instant.parse("2026-12-01T00:00:00Z"));
        Cookie earlier = viewer();
        assertThat(thumb(id, earlier)).isEqualTo(404);
    }

    @Test
    void unknownSizeIs404() throws Exception {
        String id = newMediaWithFile();
        place(ONE, id);

        assertThat(mvc.perform(get("/api/media/" + id + "/huge").cookie(viewer())).andReturn().getResponse()
                .getStatus()).isEqualTo(404);
    }
}
