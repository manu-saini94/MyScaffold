package com.ourstory.experience;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.ourstory.common.UlidGenerator;
import jakarta.servlet.http.Cookie;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

/** GET /api/experience: shapes, ordering, hero rules, locking by time, admin preview. */
class ExperienceApiTest extends ExperienceTestBase {

    private static final java.util.Set<String> TOP = set("serverTime", "appTitle", "tagline", "defaultTheme",
            "specialDate", "easterEggNicknames", "profiles", "hero", "worlds");
    private static final java.util.Set<String> OPEN_CARD = set("slug", "title", "subtitle", "tagline", "layout",
            "themeAccent", "sortOrder", "locked", "momentCount", "cover", "previewMediaIds");
    private static final java.util.Set<String> LOCKED_CARD = set("slug", "title", "subtitle", "layout",
            "themeAccent", "sortOrder", "locked", "unlockAt");
    private static final java.util.Set<String> MEDIA_REF = set("mediaId", "width", "height", "lqip",
            "dominantColor");

    private JsonNode experienceAs(Cookie cookie) throws Exception {
        MvcResult result = mvc.perform(get("/api/experience").cookie(cookie)).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "private, no-store")).andReturn();
        return body(result);
    }

    @Test
    void viewerGetsSixWorldsInOrderWithForeverLockedAsTeaserOnly() throws Exception {
        JsonNode root = experienceAs(viewer());

        assertThat(fields(root)).isEqualTo(TOP);
        assertThat(root.get("serverTime").asText()).isEqualTo("2026-10-01T00:00:00Z");
        assertThat(root.get("appTitle").asText()).isEqualTo(settings.appTitle());
        assertThat(root.get("defaultTheme").asText()).isEqualTo("rose");
        assertThat(root.get("specialDate").asText()).isEqualTo("2027-02-14");
        assertThat(root.get("easterEggNicknames")).hasSize(1);
        assertThat(root.get("profiles").get(0).toString())
                .isEqualTo("{\"id\":\"her\",\"name\":\"Anvi\",\"role\":\"viewer\"}");
        assertThat(root.get("profiles").get(1).toString())
                .isEqualTo("{\"id\":\"me\",\"name\":\"Manu\",\"role\":\"decoy\"}");

        JsonNode worldsNode = root.get("worlds");
        assertThat(worldsNode).hasSize(6);
        List<String> slugs = new ArrayList<>();
        worldsNode.forEach(w -> slugs.add(w.get("slug").asText()));
        assertThat(slugs).containsExactlyElementsOf(SEED_SLUGS);
        for (int i = 0; i < 5; i++) {
            assertThat(fields(worldsNode.get(i))).isEqualTo(OPEN_CARD);
            assertThat(worldsNode.get(i).get("locked").asBoolean()).isFalse();
            assertThat(worldsNode.get(i).get("sortOrder").asInt()).isEqualTo(i + 1);
            assertThat(worldsNode.get(i).get("momentCount").asInt()).isZero();
            assertThat(worldsNode.get(i).get("cover").isNull()).isTrue();
            assertThat(worldsNode.get(i).get("previewMediaIds")).isEmpty();
        }
        JsonNode forever = worldsNode.get(5);
        assertThat(fields(forever)).isEqualTo(LOCKED_CARD);
        assertThat(forever.get("locked").asBoolean()).isTrue();
        assertThat(forever.get("unlockAt").asText()).isEqualTo("2027-02-13T18:30:00Z");
        assertThat(forever.get("layout").asText()).isEqualTo("CONSTELLATION");
        assertThat(root.get("hero")).isEmpty();
    }

    @Test
    void lockedWorldNeverLeaksItsContent() throws Exception {
        String cover = newMedia();
        String inside = newMedia();
        place(FOREVER, inside);
        jdbc.sql("UPDATE world SET cover_media_id = :c WHERE id = :id").param("c", cover).param("id", FOREVER)
                .update();
        addLetter(FOREVER, "Secret letter", "secret body", 1);

        MvcResult result = mvc.perform(get("/api/experience").cookie(viewer())).andExpect(status().isOk())
                .andReturn();
        String raw = result.getResponse().getContentAsString();

        assertThat(raw).doesNotContain(cover, inside, "Secret letter", "secret body",
                "The best chapter is the next one", "Every star here is a promise");
        JsonNode forever = body(result).get("worlds").get(5);
        assertThat(fields(forever)).isEqualTo(LOCKED_CARD);
        assertThat(body(result).get("hero")).isEmpty();
    }

    @Test
    void responseNeverCarriesCredentialsOrInternals() throws Exception {
        String raw = mvc.perform(get("/api/experience").cookie(viewer())).andReturn().getResponse()
                .getContentAsString().toLowerCase();

        assertThat(raw).doesNotContain("pbkdf2", "viewer_epoch", "viewerepoch", "unlockanswer", "hash",
                "test question", "sample", "password", "secret");
    }

    @Test
    void worldsFollowSortOrderAndUnpublishedAreHiddenFromViewers() throws Exception {
        newWorld("zzz-first", 0, true, null, null);
        newWorld("hidden-draft", 7, false, null, null);

        JsonNode viewerView = experienceAs(viewer());
        List<String> slugs = new ArrayList<>();
        viewerView.get("worlds").forEach(w -> slugs.add(w.get("slug").asText()));

        assertThat(slugs).hasSize(7).startsWith("zzz-first").doesNotContain("hidden-draft");
        assertThat(slugs.subList(1, 7)).containsExactlyElementsOf(SEED_SLUGS);
    }

    @Test
    void openWorldShowsCountCoverAndAtMostThreePreviewsInDisplayOrder() throws Exception {
        String cover = newMedia();
        List<String> ids = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            ids.add(newMedia());
        }
        place(ONE, ids.toArray(String[]::new));
        jdbc.sql("UPDATE world SET cover_media_id = :c WHERE id = :id").param("c", cover).param("id", ONE)
                .update();

        JsonNode card = experienceAs(viewer()).get("worlds").get(0);

        assertThat(card.get("momentCount").asInt()).isEqualTo(5);
        assertThat(fields(card.get("cover"))).isEqualTo(MEDIA_REF);
        assertThat(card.get("cover").get("mediaId").asText()).isEqualTo(cover);
        assertThat(card.get("cover").get("width").asInt()).isEqualTo(400);
        assertThat(card.get("cover").get("lqip").asText()).startsWith("data:image/jpeg");
        assertThat(card.get("cover").get("dominantColor").asText()).isEqualTo("#112233");
        List<String> previews = new ArrayList<>();
        card.get("previewMediaIds").forEach(n -> previews.add(n.asText()));
        assertThat(previews).containsExactlyElementsOf(ids.subList(0, 3));
    }

    @Test
    void configuredHeroKeepsOnlyExistingVisibleMediaAndToleratesStaleIds() throws Exception {
        String visibleA = newMedia();
        String visibleB = newMedia();
        String inLocked = newMedia();
        String stale = new UlidGenerator().next();
        place(ONE, visibleA, visibleB);
        place(FOREVER, inLocked);
        setHero(visibleB, stale, inLocked, visibleA);

        JsonNode hero = experienceAs(viewer()).get("hero");

        assertThat(hero).hasSize(2);
        assertThat(fields(hero.get(0))).isEqualTo(MEDIA_REF);
        assertThat(hero.get(0).get("mediaId").asText()).isEqualTo(visibleB);
        assertThat(hero.get(1).get("mediaId").asText()).isEqualTo(visibleA);
    }

    @Test
    void emptyHeroFallsBackToCoversThenFirstMomentMediaMaxEight() throws Exception {
        List<String> covers = new ArrayList<>();
        for (int i = 0; i < 7; i++) {
            String cover = newMedia();
            covers.add(cover);
            newWorld("extra-" + i, 10 + i, true, null, cover);
        }
        String first = newMedia();
        place(ONE, first, newMedia());

        JsonNode hero = experienceAs(viewer()).get("hero");

        assertThat(hero).hasSize(8);
        List<String> ids = new ArrayList<>();
        hero.forEach(n -> ids.add(n.get("mediaId").asText()));
        assertThat(ids.subList(0, 7)).containsExactlyElementsOf(covers);
        assertThat(ids.get(7)).isEqualTo(first);
    }

    @Test
    void fallbackHeroIgnoresLockedAndUnpublishedWorlds() throws Exception {
        String hiddenCover = newMedia();
        String lockedPhoto = newMedia();
        newWorld("draft", 20, false, null, hiddenCover);
        place(FOREVER, lockedPhoto);

        assertThat(experienceAs(viewer()).get("hero")).isEmpty();
    }

    @Test
    void foreverUnlocksExactlyAtTheInstantAndNotOneSecondBefore() throws Exception {
        String photo = newMedia();
        place(FOREVER, photo);

        clock.set(FOREVER_UNLOCK.minusSeconds(1));
        JsonNode before = experienceAs(viewer()).get("worlds").get(5);
        clock.set(FOREVER_UNLOCK);
        JsonNode at = experienceAs(viewer()).get("worlds").get(5);
        clock.set(FOREVER_UNLOCK.plus(Duration.ofDays(1)));
        JsonNode after = experienceAs(viewer()).get("worlds").get(5);

        assertThat(before.get("locked").asBoolean()).isTrue();
        assertThat(fields(before)).isEqualTo(LOCKED_CARD);
        assertThat(at.get("locked").asBoolean()).isFalse();
        assertThat(fields(at)).isEqualTo(OPEN_CARD);
        assertThat(at.get("momentCount").asInt()).isEqualTo(1);
        assertThat(at.get("previewMediaIds").get(0).asText()).isEqualTo(photo);
        assertThat(fields(after)).isEqualTo(OPEN_CARD);
    }

    @Test
    void adminSeesLockedAndUnpublishedWorldsAsOpenWithAdminPreview() throws Exception {
        newWorld("draft", 20, false, null, null);
        place(FOREVER, newMedia());

        MvcResult result = mvc.perform(get("/api/experience").with(admin())).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "private, no-store")).andReturn();
        JsonNode root = body(result);

        assertThat(root.get("adminPreview").asBoolean()).isTrue();
        assertThat(root.get("worlds")).hasSize(7);
        JsonNode forever = root.get("worlds").get(5);
        assertThat(fields(forever)).isEqualTo(OPEN_CARD);
        assertThat(forever.get("locked").asBoolean()).isFalse();
        assertThat(forever.get("momentCount").asInt()).isEqualTo(1);
        assertThat(root.get("worlds").get(6).get("slug").asText()).isEqualTo("draft");
    }

    @Test
    void viewerNeverGetsAdminPreview() throws Exception {
        assertThat(experienceAs(viewer()).has("adminPreview")).isFalse();
    }

    @Test
    void anonymousCallerIsRejectedAndNothingIsCached() throws Exception {
        mvc.perform(get("/api/experience")).andExpect(status().isUnauthorized());
    }

    @Test
    void serverTimeIsFreshOnEveryCall() throws Exception {
        Cookie cookie = viewer();
        String first = experienceAs(cookie).get("serverTime").asText();
        clock.set(START.plusSeconds(5));
        String second = experienceAs(cookie).get("serverTime").asText();

        assertThat(first).isEqualTo("2026-10-01T00:00:00Z");
        assertThat(second).isEqualTo("2026-10-01T00:00:05Z");
    }
}
