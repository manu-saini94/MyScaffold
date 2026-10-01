package com.ourstory.content;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ourstory.settings.SettingKeys;
import com.ourstory.settings.SettingsService;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Review fixes of the admin content API: reorder validation, PUT presence semantics, music URL, hero pruning. */
class AdminContentHardeningTest extends ContentTestBase {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired SettingsService settings;

    @AfterEach
    void resetHero() {
        settings.applyUpdate(Map.of(SettingKeys.HERO_MEDIA_IDS, "[]"), null);
    }

    private ResultActions send(MockHttpServletRequestBuilder b, String body) throws Exception {
        MockHttpServletRequestBuilder withAuth = b
                .with(oidcLogin().idToken(t -> t.claim("email", "me@example.com"))
                        .authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                .with(csrf());
        return mvc.perform(body == null ? withAuth : withAuth.contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private static String world(String slug, String extra) {
        return "{\"slug\":\"" + slug + "\",\"title\":\"T\",\"layout\":\"POSTCARDS\"" + extra + "}";
    }

    private JsonNode body(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString());
    }

    // --- reorder ---------------------------------------------------------------------------------------

    @Test
    void reorderWithNullBlankOrMalformedElementsIs400NeverA500() throws Exception {
        for (String ids : new String[] {"[null]", "[\"\"]", "[\"   \"]", "[\"not-a-ulid\"]", "[1]", "null"}) {
            send(put("/api/admin/worlds/reorder"), "{\"orderedIds\":" + ids + "}")
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.type").value("urn:ourstory:problem:validation-failed"))
                    .andExpect(jsonPath("$.errors").isArray());
        }
    }

    // --- PUT presence semantics -------------------------------------------------------------------------

    @Test
    void putKeepsOmittedPublishedAndUnlockAtAndClearsOnExplicitNull() throws Exception {
        String id = body(send(post("/api/admin/worlds"), world("presence",
                ",\"published\":false,\"unlockAt\":\"2027-02-14T00:00:00+05:30\""))
                .andExpect(status().isCreated())).get("id").asText();

        // Both omitted: both kept.
        send(put("/api/admin/worlds/" + id), world("presence", ""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.published").value(false))
                .andExpect(jsonPath("$.unlockAt").value("2027-02-13T18:30:00Z"));
        // Explicit values replace.
        send(put("/api/admin/worlds/" + id), world("presence", ",\"published\":true,\"unlockAt\":\"2028-01-01T00:00:00Z\""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.published").value(true))
                .andExpect(jsonPath("$.unlockAt").value("2028-01-01T00:00:00Z"));
        // Omitted published keeps true; explicit null unlockAt clears.
        send(put("/api/admin/worlds/" + id), world("presence", ",\"unlockAt\":null"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.published").value(true))
                .andExpect(jsonPath("$.unlockAt").doesNotExist());
        // And an omitted unlockAt keeps the cleared (null) value.
        send(put("/api/admin/worlds/" + id), world("presence", ",\"published\":false"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.published").value(false))
                .andExpect(jsonPath("$.unlockAt").doesNotExist());
        // Create still defaults published to true and unlockAt to open.
        send(post("/api/admin/worlds"), world("presence-new", ""))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.published").value(true))
                .andExpect(jsonPath("$.unlockAt").doesNotExist());
        // A malformed instant is a field error, not a 500.
        send(put("/api/admin/worlds/" + id), world("presence", ",\"unlockAt\":\"tomorrow\""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("unlockAt"));
    }

    // --- music URL -----------------------------------------------------------------------------------------

    @Test
    void musicUrlRejectsUserinfoControlCharactersQuotesBracketsAndSpaces() throws Exception {
        List<String> bad = List.of("https://user@host.test/a.mp3", "https://user:pw@host.test/a.mp3",
                "https://host.test@evil.test/a.mp3", "https://host.test\\\\@evil.test/", "https://host.test/a b",
                "https://host.test/a\\\"b", "https://host.test/a'b", "https://host.test/a<b", "https://host.test/a>b",
                "https://host.test/a\\u0007b", "https://host.test/a\\nb", "https://ho st.test/a", "http://host.test/a",
                "https://", "https://host.test/a`b", "https://host.test/a\\u0085b");
        for (String url : bad) {
            send(post("/api/admin/worlds"), world("music-bad", ",\"musicUrl\":\"" + url + "\""))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.errors[?(@.field=='musicUrl')]").exists());
        }
        assertThat(worlds.findBySlug("music-bad")).isEmpty();
        for (String url : List.of("https://music.test/a.mp3", "https://music.test:8443/a/b.mp3?x=a@b#t",
                "https://cdn.example.com", "https://[2001:db8::1]/a.mp3", "https://music.test?q=1")) {
            String slug = "music-" + Math.abs(url.hashCode());
            send(post("/api/admin/worlds"), world(slug, ",\"musicUrl\":\"" + url + "\""))
                    .andExpect(status().isCreated());
        }
    }

    // --- error shape ------------------------------------------------------------------------------------------

    @Test
    void malformedAndMistypedBodiesUseTheSingleValidationShape() throws Exception {
        send(post("/api/admin/worlds"), "{not json").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.type").value("urn:ourstory:problem:validation-failed"))
                .andExpect(jsonPath("$.errors[0].field").value("body"));
        send(post("/api/admin/worlds"), world("x", "").replace("POSTCARDS", "SPIRAL"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors[0].field").value("layout"))
                .andExpect(jsonPath("$.errors[0].message").value("Invalid value or type"));
        send(put("/api/admin/worlds/" + SEED_IDS.iterator().next() + "/moments"),
                "{\"moments\":[{\"mediaId\":\"" + seedMedia() + "\",\"happenedOn\":\"yesterday\"}]}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("moments[0].happenedOn"));
    }

    // --- deleting media prunes the hero list and clears covers ---------------------------------------------

    @Test
    void deletingAPhotoRemovesItFromTheHeroListAndClearsCoversButKeepsOthers() throws Exception {
        String doomed = seedMedia();
        String keep = seedMedia();
        World w = newWorld("hero-prune", 30);
        jdbc.sql("UPDATE world SET cover_media_id = :m WHERE id = :id").param("m", doomed).param("id", w.id()).update();
        settings.applyUpdate(Map.of(SettingKeys.HERO_MEDIA_IDS, json.writeValueAsString(List.of(doomed, keep))), null);

        send(delete("/api/admin/media/" + doomed), null).andExpect(status().isNoContent());

        assertThat(settings.heroMediaIds()).containsExactly(keep);
        assertThat(worlds.findById(w.id()).orElseThrow().coverMediaId()).isNull();
        // Deleting a photo that is not in the list leaves it untouched.
        send(delete("/api/admin/media/" + keep), null).andExpect(status().isNoContent());
        assertThat(settings.heroMediaIds()).isEmpty();
        mvc.perform(get("/api/admin/worlds/" + w.id()).with(oidcLogin()
                .idToken(t -> t.claim("email", "me@example.com"))
                .authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))).andExpect(status().isOk());
    }
}
