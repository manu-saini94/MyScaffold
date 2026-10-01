package com.ourstory.settings;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ourstory.common.ApiException;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

class SettingsValidatorTest {

    private static final String ULID = "01HZX0000000000000000000AB";
    private final ObjectMapper mapper = new ObjectMapper();
    private final SettingsValidator validator = new SettingsValidator(mapper);

    private Map<String, JsonNode> json(String body) throws Exception {
        Map<String, JsonNode> map = new LinkedHashMap<>();
        mapper.readTree(body).fields().forEachRemaining(e -> map.put(e.getKey(), e.getValue()));
        return map;
    }

    @SuppressWarnings("unchecked")
    private Map<String, String> errorsOf(String body) throws Exception {
        Map<String, JsonNode> changes = json(body);
        try {
            validator.validate(changes);
        } catch (ApiException e) {
            assertThat(e.status().value()).isEqualTo(400);
            return (Map<String, String>) e.properties().get("errors");
        }
        throw new AssertionError("expected a validation failure for " + body);
    }

    @Test
    void acceptsAndNormalisesValidValues() throws Exception {
        Map<String, String> values = validator.validate(json("""
                {"appTitle":"  Us  ","tagline":"","defaultTheme":"cinema","specialDate":"2027-02-14",
                 "herName":"Anvi","myName":"Manu","easterEggNicknames":["anvi","Bunny"],
                 "heroMediaIds":["%s"],"unlockQuestion":"Where?"}""".formatted(ULID)));
        assertThat(values).containsEntry("app_title", "Us").containsEntry("tagline", "")
                .containsEntry("default_theme", "cinema").containsEntry("special_date", "2027-02-14")
                .containsEntry("easter_egg_nicknames", "[\"anvi\",\"Bunny\"]")
                .containsEntry("hero_media_ids", "[\"" + ULID + "\"]")
                .containsEntry("unlock_question", "Where?");
    }

    @Test
    void reportsEveryFieldProblemAtOnce() throws Exception {
        Map<String, String> errors = errorsOf("""
                {"defaultTheme":"neon","specialDate":"2027-13-40","herName":"","appTitle":5,
                 "tagline":"%s","bogus":1,"unlockQuestion":"%s"}""".formatted("x".repeat(201), "q".repeat(301)));
        assertThat(errors).containsKeys("defaultTheme", "specialDate", "herName", "appTitle", "tagline", "bogus",
                "unlockQuestion");
        assertThat(errors.get("bogus")).isEqualTo("Unknown setting");
    }

    @Test
    void validatesListsStrictly() throws Exception {
        assertThat(errorsOf("{\"heroMediaIds\":\"x\"}")).containsKey("heroMediaIds");
        assertThat(errorsOf("{\"heroMediaIds\":[\"not-a-ulid\"]}")).containsKey("heroMediaIds");
        assertThat(errorsOf("{\"heroMediaIds\":[1]}")).containsKey("heroMediaIds");
        String eleven = "[" + String.join(",", java.util.Collections.nCopies(11, "\"" + ULID + "\"")) + "]";
        assertThat(errorsOf("{\"heroMediaIds\":" + eleven + "}")).containsKey("heroMediaIds");
        String ten = "[" + String.join(",", java.util.Collections.nCopies(10, "\"" + ULID + "\"")) + "]";
        assertThat(validator.validate(json("{\"heroMediaIds\":" + ten + "}"))).containsKey("hero_media_ids");
        assertThat(errorsOf("{\"easterEggNicknames\":[\"\"]}")).containsKey("easterEggNicknames");
        assertThat(errorsOf("{\"easterEggNicknames\":[\"" + "n".repeat(41) + "\"]}"))
                .containsKey("easterEggNicknames");
        assertThat(errorsOf("{\"appTitle\":\"bad\\u0007\"}")).containsKey("appTitle");
    }

    @Test
    void emptyChangesAreValidAndNothingToWrite() {
        assertThat(validator.validate(Map.of())).isEmpty();
        assertThatThrownBy(() -> SettingsValidator.throwIfAny(Map.of("a", "b"))).isInstanceOf(ApiException.class);
    }
}
