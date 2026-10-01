package com.ourstory.experience;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.Cookie;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

/** GET /api/worlds/{slug}: open, locked teaser, 404 without existence leak, 400 on bad slugs, admin preview. */
class WorldDetailApiTest extends ExperienceTestBase {

    private static final java.util.Set<String> OPEN = set("slug", "title", "subtitle", "tagline", "layout",
            "themeAccent", "locked", "introText", "outroText", "musicUrl", "nextSlug", "serverTime", "moments",
            "letters");
    private static final java.util.Set<String> LOCKED = set("slug", "title", "subtitle", "layout", "themeAccent",
            "locked", "unlockAt", "serverTime");
    private static final java.util.Set<String> MOMENT = set("id", "sortOrder", "caption", "note", "happenedOn",
            "place", "favourite", "media");
    private static final java.util.Set<String> MOMENT_MEDIA = set("mediaId", "mimeType", "width", "height",
            "lqip", "dominantColor", "takenAt");

    private MvcResult world(String slug, Cookie cookie) throws Exception {
        return mvc.perform(get("/api/worlds/" + slug).cookie(cookie)).andReturn();
    }

    @Test
    void openWorldReturnsFullContentOrderedWithLettersAndNextSlug() throws Exception {
        String a = newMedia();
        String b = newMedia();
        String c = newMedia();
        place(ONE, b, a, c);
        addLetter(ONE, "Second", "**bold** <script>alert(1)</script>", 2);
        addLetter(ONE, "First", "# raw markdown", 1);
        addLetter(FIRSTS, "Elsewhere", "not mine", 1);

        MvcResult result = world("where-it-all-began", viewer());
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        assertThat(result.getResponse().getHeader("Cache-Control")).isEqualTo("private, no-store");
        JsonNode root = body(result);

        assertThat(fields(root)).isEqualTo(OPEN);
        assertThat(root.get("locked").asBoolean()).isFalse();
        assertThat(root.get("nextSlug").asText()).isEqualTo("our-firsts");
        assertThat(root.get("introText").asText()).startsWith("Some beginnings");
        assertThat(root.get("musicUrl").isNull()).isTrue();
        assertThat(root.get("serverTime").asText()).isEqualTo("2026-10-01T00:00:00Z");
        JsonNode moments = root.get("moments");
        assertThat(moments).hasSize(3);
        assertThat(fields(moments.get(0))).isEqualTo(MOMENT);
        assertThat(fields(moments.get(0).get("media"))).isEqualTo(MOMENT_MEDIA);
        List<String> mediaIds = new ArrayList<>();
        List<Integer> orders = new ArrayList<>();
        moments.forEach(m -> {
            mediaIds.add(m.get("media").get("mediaId").asText());
            orders.add(m.get("sortOrder").asInt());
        });
        assertThat(mediaIds).containsExactly(b, a, c);
        assertThat(orders).containsExactly(1, 2, 3);
        assertThat(moments.get(0).get("media").get("mimeType").asText()).isEqualTo("image/jpeg");
        assertThat(moments.get(0).get("caption").asText()).isEqualTo("cap " + b);
        JsonNode letters = root.get("letters");
        assertThat(letters).hasSize(2);
        assertThat(fields(letters.get(0))).isEqualTo(set("id", "title", "body", "revealTrigger"));
        assertThat(letters.get(0).get("title").asText()).isEqualTo("First");
        assertThat(letters.get(1).get("body").asText()).isEqualTo("**bold** <script>alert(1)</script>");
        assertThat(letters.get(1).get("revealTrigger").asText()).isEqualTo("WORLD_OUTRO");
    }

    @Test
    void nextSlugMayBeLockedAndIsNullForTheLastWorld() throws Exception {
        assertThat(body(world("the-question", viewer())).get("nextSlug").asText()).isEqualTo("our-forever");

        clock.set(FOREVER_UNLOCK);
        JsonNode last = body(world("our-forever", viewer()));
        assertThat(last.get("locked").asBoolean()).isFalse();
        assertThat(last.get("nextSlug").isNull()).isTrue();
    }

    @Test
    void nextSlugSkipsUnpublishedWorlds() throws Exception {
        jdbc.sql("UPDATE world SET published = FALSE WHERE id = :id").param("id", FIRSTS).update();

        assertThat(body(world("where-it-all-began", viewer())).get("nextSlug").asText())
                .isEqualTo("adventures-together");
    }

    @Test
    void lockedWorldReturnsOnlyTheTeaser() throws Exception {
        place(FOREVER, newMedia());
        addLetter(FOREVER, "Locked letter", "locked body", 1);

        MvcResult result = world("our-forever", viewer());
        JsonNode root = body(result);

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        assertThat(fields(root)).isEqualTo(LOCKED);
        assertThat(root.get("locked").asBoolean()).isTrue();
        assertThat(root.get("unlockAt").asText()).isEqualTo("2027-02-13T18:30:00Z");
        assertThat(root.get("serverTime").asText()).isEqualTo("2026-10-01T00:00:00Z");
        assertThat(result.getResponse().getContentAsString()).doesNotContain("Locked letter", "locked body",
                "Every star here", "The best chapter");
    }

    @Test
    void lockedWorldOpensAtTheExactInstantButNotOneSecondBefore() throws Exception {
        place(FOREVER, newMedia());
        Cookie before;
        clock.set(FOREVER_UNLOCK.minusSeconds(1));
        before = viewer();
        assertThat(fields(body(world("our-forever", before)))).isEqualTo(LOCKED);

        clock.set(FOREVER_UNLOCK);
        JsonNode open = body(world("our-forever", before));

        assertThat(fields(open)).isEqualTo(OPEN);
        assertThat(open.get("moments")).hasSize(1);
    }

    @Test
    void unknownAndUnpublishedWorldsAreIndistinguishable404s() throws Exception {
        newWorld("secret-draft", 30, false, null, null);
        Cookie cookie = viewer();

        MvcResult unknown = world("no-such-world", cookie);
        MvcResult unpublished = world("secret-draft", cookie);

        assertThat(unknown.getResponse().getStatus()).isEqualTo(404);
        assertThat(unpublished.getResponse().getStatus()).isEqualTo(404);
        assertThat(problem(unpublished)).isEqualTo(problem(unknown));
        assertThat(fields(problem(unknown))).isEqualTo(set("type", "title", "status", "detail"));
        assertThat(unknown.getResponse().getContentType()).contains("problem+json");
        assertThat(unknown.getResponse().getContentAsString()).doesNotContain("secret-draft", "Exception",
                "com.ourstory", "SELECT");
    }

    @Test
    void malformedSlugsAre400WithoutInternals() throws Exception {
        Cookie cookie = viewer();
        List<String> bad = List.of("Upper", "a--b", "-lead", "trail-", "under_score", "x".repeat(65), "a.b");
        for (String slug : bad) {
            MvcResult result = world(slug, cookie);
            assertThat(result.getResponse().getStatus()).as(slug).isEqualTo(400);
            assertThat(result.getResponse().getContentAsString()).as(slug).contains("Invalid world slug")
                    .doesNotContain("Exception", "com.ourstory", "at java");
        }
    }

    @Test
    void anonymousIsRejected() throws Exception {
        mvc.perform(get("/api/worlds/where-it-all-began")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/worlds/nope")).andExpect(status().isUnauthorized());
    }

    @Test
    void adminSeesLockedWorldInFullWithPreviewFlag() throws Exception {
        place(FOREVER, newMedia());
        addLetter(FOREVER, "Locked letter", "locked body", 1);

        MvcResult result = mvc.perform(get("/api/worlds/our-forever").with(admin())).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "private, no-store")).andReturn();
        JsonNode root = body(result);

        assertThat(root.get("locked").asBoolean()).isFalse();
        assertThat(root.get("adminPreview").asBoolean()).isTrue();
        assertThat(root.get("moments")).hasSize(1);
        assertThat(root.get("letters").get(0).get("body").asText()).isEqualTo("locked body");
        assertThat(root.has("unlockAt")).isFalse();
    }

    @Test
    void adminSeesUnpublishedWorldButOrdinaryOpenWorldHasNoPreviewFlag() throws Exception {
        newWorld("draft", 0, false, null, null);

        JsonNode draft = body(mvc.perform(get("/api/worlds/draft").with(admin())).andExpect(status().isOk())
                .andReturn());
        JsonNode open = body(mvc.perform(get("/api/worlds/our-firsts").with(admin())).andExpect(status().isOk())
                .andReturn());

        assertThat(draft.get("adminPreview").asBoolean()).isTrue();
        assertThat(draft.get("nextSlug").asText()).isEqualTo("where-it-all-began");
        assertThat(open.has("adminPreview")).isFalse();
    }

    @Test
    void viewerCannotUseAnAdminOnlyShortcutToUnpublished() throws Exception {
        newWorld("draft", 30, false, null, null);

        assertThat(world("draft", viewer()).getResponse().getStatus()).isEqualTo(404);
    }
}
