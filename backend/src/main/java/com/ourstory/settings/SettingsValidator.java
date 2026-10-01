package com.ourstory.settings;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ourstory.common.ApiException;
import com.ourstory.common.UlidGenerator;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Per-key validation of admin-editable settings. Collects every problem and reports them together as a
 * 400 ProblemDetail with an {@code errors} object (field name to message). Unknown keys are rejected.
 */
@Component
public class SettingsValidator {

    static final int MAX_TITLE = 100;
    static final int MAX_TAGLINE = 200;
    static final int MAX_NAME = 60;
    static final int MAX_QUESTION = 300;
    static final int MAX_LIST = 10;
    static final int MAX_NICKNAME = 40;
    public static final String QUESTION_NAME = "unlockQuestion";
    static final Set<String> THEMES = Set.of("rose", "cinema");

    private final ObjectMapper mapper;

    public SettingsValidator(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    /**
     * @param changes admin API name to JSON value (camelCase names, see {@link SettingKeys#EDITABLE}, plus
     *                {@code unlockQuestion})
     * @return storage key to validated, normalised string value
     * @throws ApiException 400 with field errors when anything is invalid or unknown
     */
    public Map<String, String> validate(Map<String, JsonNode> changes) {
        Map<String, String> errors = new LinkedHashMap<>();
        Map<String, String> values = collect(changes, errors);
        throwIfAny(errors);
        return values;
    }

    /** Like {@link #validate} but adds problems to {@code errors} so callers can merge their own. */
    public Map<String, String> collect(Map<String, JsonNode> changes, Map<String, String> errors) {
        Map<String, String> values = new LinkedHashMap<>();
        changes.forEach((name, node) -> {
            String storageKey = QUESTION_NAME.equals(name) ? SettingKeys.UNLOCK_QUESTION
                    : SettingKeys.EDITABLE.get(name);
            if (storageKey == null) {
                errors.put(name, "Unknown setting");
                return;
            }
            try {
                values.put(storageKey, validateOne(storageKey, node));
            } catch (IllegalArgumentException e) {
                errors.put(name, e.getMessage());
            }
        });
        return values;
    }

    public static ApiException fieldErrors(Map<String, String> errors) {
        return new ApiException(HttpStatus.BAD_REQUEST, "validation-failed", "Invalid settings",
                Map.of("errors", Map.copyOf(errors)));
    }

    public static void throwIfAny(Map<String, String> errors) {
        if (!errors.isEmpty()) {
            throw fieldErrors(errors);
        }
    }

    private String validateOne(String key, JsonNode node) {
        return switch (key) {
            case SettingKeys.APP_TITLE -> text(node, 1, MAX_TITLE);
            case SettingKeys.UNLOCK_QUESTION -> text(node, 1, MAX_QUESTION);
            case SettingKeys.TAGLINE -> text(node, 0, MAX_TAGLINE);
            case SettingKeys.HER_NAME, SettingKeys.MY_NAME -> text(node, 1, MAX_NAME);
            case SettingKeys.DEFAULT_THEME -> theme(node);
            case SettingKeys.SPECIAL_DATE -> date(node);
            case SettingKeys.EASTER_EGG_NICKNAMES -> list(node, 1, MAX_NICKNAME, false);
            case SettingKeys.HERO_MEDIA_IDS -> list(node, 26, 26, true);
            default -> throw new IllegalArgumentException("Unknown setting");
        };
    }

    private static String text(JsonNode node, int min, int max) {
        if (node == null || !node.isTextual()) {
            throw new IllegalArgumentException("Must be a string");
        }
        String value = node.asText().strip();
        if (value.length() < min || value.length() > max) {
            throw new IllegalArgumentException(min == 0 ? "Must be at most " + max + " characters"
                    : "Must be " + min + " to " + max + " characters");
        }
        if (value.chars().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException("Must not contain control characters");
        }
        return value;
    }

    private static String theme(JsonNode node) {
        String value = text(node, 1, MAX_NAME);
        if (!THEMES.contains(value)) {
            throw new IllegalArgumentException("Must be one of " + String.join(", ", THEMES.stream().sorted().toList()));
        }
        return value;
    }

    private static String date(JsonNode node) {
        String value = text(node, 1, 10);
        try {
            return LocalDate.parse(value).toString();
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("Must be an ISO date (yyyy-MM-dd)");
        }
    }

    /** JSON array of at most {@link #MAX_LIST} strings; ULID mode checks each entry as a ULID. */
    private String list(JsonNode node, int min, int max, boolean ulids) {
        if (node == null || !node.isArray()) {
            throw new IllegalArgumentException("Must be an array");
        }
        if (node.size() > MAX_LIST) {
            throw new IllegalArgumentException("At most " + MAX_LIST + " entries");
        }
        List<String> items = new ArrayList<>();
        for (JsonNode element : node) {
            String item = text(element, min, max);
            if (ulids && !UlidGenerator.isValid(item)) {
                throw new IllegalArgumentException("Entries must be valid ids");
            }
            items.add(item);
        }
        try {
            return mapper.writeValueAsString(items);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
