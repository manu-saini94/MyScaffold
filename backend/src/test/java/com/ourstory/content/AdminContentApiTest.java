package com.ourstory.content;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.OidcLoginRequestPostProcessor;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.ResultActions;

/** HTTP surface of the content admin API: security, status codes, ProblemDetail bodies. */
class AdminContentApiTest extends ContentTestBase {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;

    private static OidcLoginRequestPostProcessor admin() {
        return oidcLogin().idToken(t -> t.claim("email", "me@example.com"))
                .authorities(new SimpleGrantedAuthority("ROLE_ADMIN"));
    }

    private static OidcLoginRequestPostProcessor stranger() {
        return oidcLogin().idToken(t -> t.claim("email", "evil@example.com"));
    }

    private ResultActions send(MockHttpServletRequestBuilder b, String body) throws Exception {
        MockHttpServletRequestBuilder withAuth = b.with(admin()).with(csrf());
        return mvc.perform(body == null ? withAuth : withAuth.contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private static String worldJson(String slug) {
        return """
                {"slug":"%s","title":"My World","subtitle":"s","layout":"FILM_STRIP","themeAccent":"#b3122f",
                 "unlockAt":"2027-02-14T00:00:00+05:30","musicUrl":"https://music.test/a.mp3","published":true}
                """.formatted(slug);
    }

    private String createWorld(String slug) throws Exception {
        String body = send(post("/api/admin/worlds"), worldJson(slug)).andExpect(status().isCreated()).andReturn()
                .getResponse().getContentAsString();
        return json.readTree(body).get("id").asText();
    }

    // --- security ------------------------------------------------------------------------------------

    @Test
    void everyEndpointIs401Anonymous403NonAdminAnd403WithoutCsrfWhenMutating() throws Exception {
        String id = ulids.next();
        List<MockHttpServletRequestBuilder> reads = List.of(get("/api/admin/worlds"), get("/api/admin/worlds/" + id),
                get("/api/admin/worlds/" + id + "/moments"), get("/api/admin/letters"));
        for (MockHttpServletRequestBuilder read : reads) {
            mvc.perform(read).andExpect(status().isUnauthorized());
        }
        for (MockHttpServletRequestBuilder read : List.of(get("/api/admin/worlds"), get("/api/admin/letters"))) {
            mvc.perform(read.with(stranger())).andExpect(status().isForbidden());
        }
        List<MockHttpServletRequestBuilder> writes = List.of(post("/api/admin/worlds"),
                put("/api/admin/worlds/" + id), delete("/api/admin/worlds/" + id), put("/api/admin/worlds/reorder"),
                put("/api/admin/worlds/" + id + "/moments"), post("/api/admin/letters"),
                put("/api/admin/letters/" + id), delete("/api/admin/letters/" + id));
        for (MockHttpServletRequestBuilder write : writes) {
            mvc.perform(write.with(admin()).contentType(MediaType.APPLICATION_JSON).content("{}"))
                    .andExpect(status().isForbidden());
            mvc.perform(write.with(stranger()).with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{}"))
                    .andExpect(status().isForbidden());
        }
    }

    // --- worlds --------------------------------------------------------------------------------------

    @Test
    void listIncludesUnpublishedWithMomentCountsInOrder() throws Exception {
        String id = createWorld("hidden-one");
        send(put("/api/admin/worlds/" + id), worldJson("hidden-one").replace("\"published\":true", "\"published\":false"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/admin/worlds").with(admin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(7))
                .andExpect(jsonPath("$[0].slug").value("where-it-all-began"))
                .andExpect(jsonPath("$[5].unlockAt").value("2027-02-13T18:30:00Z"))
                .andExpect(jsonPath("$[6].slug").value("hidden-one"))
                .andExpect(jsonPath("$[6].published").value(false))
                .andExpect(jsonPath("$[6].momentCount").value(0));
    }

    @Test
    void createReturns201WithLocationAndBody() throws Exception {
        send(post("/api/admin/worlds"), worldJson("fresh-world"))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", containsString("/api/admin/worlds/")))
                .andExpect(jsonPath("$.slug").value("fresh-world"))
                .andExpect(jsonPath("$.sortOrder").value(7))
                .andExpect(jsonPath("$.layout").value("FILM_STRIP"))
                .andExpect(jsonPath("$.unlockAt").value("2027-02-13T18:30:00Z"));
    }

    @Test
    void getUpdateAndDeleteWorld() throws Exception {
        String id = createWorld("crud-world");
        mvc.perform(get("/api/admin/worlds/" + id).with(admin())).andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("My World"));
        send(put("/api/admin/worlds/" + id), worldJson("crud-renamed")).andExpect(status().isOk())
                .andExpect(jsonPath("$.slug").value("crud-renamed")).andExpect(jsonPath("$.id").value(id));
        send(delete("/api/admin/worlds/" + id), null).andExpect(status().isNoContent());
        mvc.perform(get("/api/admin/worlds/" + id).with(admin())).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.type").value("urn:ourstory:problem:not-found"));
        send(delete("/api/admin/worlds/" + id), null).andExpect(status().isNotFound());
        send(put("/api/admin/worlds/" + id), worldJson("zzz")).andExpect(status().isNotFound());
    }

    @Test
    void invalidIdsAre400BeforeTheDatabase() throws Exception {
        mvc.perform(get("/api/admin/worlds/not-a-ulid").with(admin())).andExpect(status().isBadRequest());
        mvc.perform(get("/api/admin/worlds/not-a-ulid/moments").with(admin())).andExpect(status().isBadRequest());
        send(put("/api/admin/worlds/x'--"), worldJson("abc")).andExpect(status().isBadRequest());
        send(delete("/api/admin/worlds/nope"), null).andExpect(status().isBadRequest());
        send(put("/api/admin/worlds/nope/moments"), "{\"moments\":[]}").andExpect(status().isBadRequest());
        send(put("/api/admin/letters/nope"), "{}").andExpect(status().isBadRequest());
        send(delete("/api/admin/letters/nope"), null).andExpect(status().isBadRequest());
        mvc.perform(get("/api/admin/letters?worldId=nope").with(admin())).andExpect(status().isBadRequest());
    }

    @Test
    void duplicateSlugIs409ProblemDetail() throws Exception {
        send(post("/api/admin/worlds"), worldJson("our-firsts")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.type").value("urn:ourstory:problem:slug-conflict"))
                .andExpect(jsonPath("$.status").value(409));
    }

    @Test
    void beanValidationGives400WithFieldErrorsAndNoEchoedValues() throws Exception {
        String body = """
                {"slug":"Bad Slug","title":" ","layout":"FILM_STRIP","themeAccent":"red",
                 "musicUrl":"http://insecure.test/a.mp3","subtitle":"%s"}
                """.formatted("s".repeat(201));
        String response = send(post("/api/admin/worlds"), body).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[?(@.field=='slug')]").exists())
                .andExpect(jsonPath("$.errors[?(@.field=='title')]").exists())
                .andExpect(jsonPath("$.errors[?(@.field=='themeAccent')]").exists())
                .andExpect(jsonPath("$.errors[?(@.field=='musicUrl')]").exists())
                .andExpect(jsonPath("$.errors[?(@.field=='subtitle')]").exists())
                .andExpect(jsonPath("$.errors[*].message").value(not(hasItem(containsString("Bad Slug")))))
                .andReturn().getResponse().getContentAsString();
        assertThat(response).doesNotContain("Exception").doesNotContain("at com.");
        assertThat(worlds.findBySlug("Bad Slug")).isEmpty();
    }

    @Test
    void unknownLayoutAndMalformedJsonAre400() throws Exception {
        send(post("/api/admin/worlds"), worldJson("x").replace("FILM_STRIP", "SPIRAL")).andExpect(status().isBadRequest());
        send(post("/api/admin/worlds"), "{not json").andExpect(status().isBadRequest());
        send(post("/api/admin/worlds"), worldJson("x").replace("\"title\":\"My World\",", "")).andExpect(status().isBadRequest());
    }

    @Test
    void unknownCoverMediaIs422() throws Exception {
        String body = worldJson("covered").replace("\"layout\"", "\"coverMediaId\":\"" + ulids.next() + "\",\"layout\"");
        send(post("/api/admin/worlds"), body).andExpect(status().isUnprocessableEntity());
    }

    @Test
    void reorderRequiresAPermutationAndReturnsTheNewOrder() throws Exception {
        List<String> ids = worlds.findAll().stream().map(World::id).toList();
        List<String> reversed = ids.reversed();
        send(put("/api/admin/worlds/reorder"), json.writeValueAsString(java.util.Map.of("orderedIds", reversed)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(reversed.get(0)))
                .andExpect(jsonPath("$[5].sortOrder").value(6));
        send(put("/api/admin/worlds/reorder"), json.writeValueAsString(java.util.Map.of("orderedIds", ids.subList(1, 6))))
                .andExpect(status().isUnprocessableEntity());
        send(put("/api/admin/worlds/reorder"), "{}").andExpect(status().isBadRequest());
        send(put("/api/admin/worlds/reorder"), json.writeValueAsString(java.util.Map.of("orderedIds", ids)))
                .andExpect(status().isOk());
    }

    // --- moments -------------------------------------------------------------------------------------

    @Test
    void replaceAndListMoments() throws Exception {
        String world = createWorld("with-moments");
        String a = seedMedia();
        String b = seedMedia();
        String body = """
                {"moments":[{"mediaId":"%s","caption":"one","note":"back","happenedOn":"2024-02-14","place":"Goa",
                             "favourite":true},{"mediaId":"%s"}]}
                """.formatted(b, a);
        send(put("/api/admin/worlds/" + world + "/moments"), body).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].mediaId").value(b))
                .andExpect(jsonPath("$[0].favourite").value(true))
                .andExpect(jsonPath("$[0].happenedOn").value("2024-02-14"))
                .andExpect(jsonPath("$[0].width").value(400))
                .andExpect(jsonPath("$[1].sortOrder").value(2));
        mvc.perform(get("/api/admin/worlds/" + world + "/moments").with(admin())).andExpect(status().isOk())
                .andExpect(jsonPath("$[1].mediaId").value(a));
        mvc.perform(get("/api/admin/worlds").with(admin()))
                .andExpect(jsonPath("$[?(@.id=='" + world + "')].momentCount").value(2));
    }

    @Test
    void momentErrors404422And400() throws Exception {
        String world = createWorld("moment-errors");
        String ghost = ulids.next();
        send(put("/api/admin/worlds/" + ulids.next() + "/moments"), "{\"moments\":[]}").andExpect(status().isNotFound());
        mvc.perform(get("/api/admin/worlds/" + ulids.next() + "/moments").with(admin())).andExpect(status().isNotFound());
        send(put("/api/admin/worlds/" + world + "/moments"), "{\"moments\":[{\"mediaId\":\"" + ghost + "\"}]}")
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.missingMediaIds[0]").value(ghost));
        String a = seedMedia();
        send(put("/api/admin/worlds/" + world + "/moments"),
                "{\"moments\":[{\"mediaId\":\"" + a + "\"},{\"mediaId\":\"" + a + "\"}]}")
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.type").value("urn:ourstory:problem:duplicate-media"));
        send(put("/api/admin/worlds/" + world + "/moments"),
                "{\"moments\":[{\"mediaId\":\"" + a + "\",\"caption\":\"" + "c".repeat(501) + "\"}]}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("moments[0].caption"));
        send(put("/api/admin/worlds/" + world + "/moments"), "{\"moments\":[{\"mediaId\":\"zzz\"}]}")
                .andExpect(status().isBadRequest());
        send(put("/api/admin/worlds/" + world + "/moments"), "{}").andExpect(status().isBadRequest());
        assertThat(moments.listByWorld(world)).isEmpty();
    }

    // --- letters -------------------------------------------------------------------------------------

    @Test
    void letterCrudAndWorldFilter() throws Exception {
        String world = createWorld("lettered");
        String created = send(post("/api/admin/letters"),
                "{\"worldId\":\"" + world + "\",\"title\":\"Dear\",\"body\":\"# hi\",\"revealTrigger\":\"WORLD_OUTRO\"}")
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", containsString("/api/admin/letters/")))
                .andReturn().getResponse().getContentAsString();
        JsonNode node = json.readTree(created);
        String id = node.get("id").asText();
        assertThat(node.get("body").asText()).isEqualTo("# hi");

        send(post("/api/admin/letters"), "{\"title\":\"Loose\",\"body\":\"b\",\"revealTrigger\":\"SEALED_ICON\"}")
                .andExpect(status().isCreated()).andExpect(jsonPath("$.worldId").doesNotExist());
        mvc.perform(get("/api/admin/letters").with(admin())).andExpect(jsonPath("$.length()").value(2));
        mvc.perform(get("/api/admin/letters?worldId=" + world).with(admin())).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].id").value(id));

        send(put("/api/admin/letters/" + id),
                "{\"title\":\"Edited\",\"body\":\"new\",\"revealTrigger\":\"SEALED_ICON\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Edited")).andExpect(jsonPath("$.worldId").doesNotExist());
        send(delete("/api/admin/letters/" + id), null).andExpect(status().isNoContent());
        send(delete("/api/admin/letters/" + id), null).andExpect(status().isNotFound());
        send(put("/api/admin/letters/" + id), "{\"title\":\"t\",\"body\":\"b\",\"revealTrigger\":\"SEALED_ICON\"}")
                .andExpect(status().isNotFound());
    }

    @Test
    void letterValidation() throws Exception {
        send(post("/api/admin/letters"), "{\"title\":\"t\",\"body\":\"" + "b".repeat(20001)
                + "\",\"revealTrigger\":\"SEALED_ICON\"}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("body"));
        send(post("/api/admin/letters"), "{\"title\":\"t\",\"body\":\"" + "b".repeat(20000)
                + "\",\"revealTrigger\":\"SEALED_ICON\"}").andExpect(status().isCreated());
        send(post("/api/admin/letters"), "{\"title\":\"\",\"body\":\"b\",\"revealTrigger\":\"NEVER\"}")
                .andExpect(status().isBadRequest());
        send(post("/api/admin/letters"), "{\"title\":\"t\",\"body\":\"b\"}").andExpect(status().isBadRequest());
        send(post("/api/admin/letters"), "{\"worldId\":\"bad\",\"title\":\"t\",\"body\":\"b\","
                + "\"revealTrigger\":\"SEALED_ICON\"}").andExpect(status().isBadRequest());
        send(post("/api/admin/letters"), "{\"worldId\":\"" + ulids.next() + "\",\"title\":\"t\",\"body\":\"b\","
                + "\"revealTrigger\":\"SEALED_ICON\"}").andExpect(status().isUnprocessableEntity());
    }
}
