package com.ourstory.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.ourstory.settings.SettingsService;
import com.ourstory.settings.SettingsValidator;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Service;

/** Admin-side settings operations, including write-only unlock answers (hashed here, never stored plain). */
@Service
class AdminSettingsService {

    static final String ANSWERS_NAME = "unlockAnswers";
    static final int MAX_ANSWERS = UnlockBootstrap.MAX_ANSWERS;

    private final SettingsService settings;
    private final SettingsValidator validator;
    private final AnswerHasher hasher;
    private final ViewerEpoch epoch;

    AdminSettingsService(SettingsService settings, SettingsValidator validator, AnswerHasher hasher,
            ViewerEpoch epoch) {
        this.settings = settings;
        this.validator = validator;
        this.hasher = hasher;
        this.epoch = epoch;
    }

    /** All non-secret settings plus the question and how many answers exist (never answers or hashes). */
    Map<String, Object> view() {
        Map<String, Object> view = new LinkedHashMap<>(settings.publicView());
        view.put("unlockQuestion", settings.unlockQuestion().orElse(null));
        view.put("unlockAnswersConfigured", settings.unlockAnswerHashes().size());
        return view;
    }

    /** Partial update. Validates everything first; nothing is written when anything is invalid. */
    Map<String, Object> update(Map<String, JsonNode> changes) {
        Map<String, JsonNode> rest = new LinkedHashMap<>(changes);
        JsonNode answersNode = rest.remove(ANSWERS_NAME);
        Map<String, String> errors = new LinkedHashMap<>();
        Map<String, String> values = validator.collect(rest, errors);
        List<String> hashes = null;
        if (changes.containsKey(ANSWERS_NAME)) {
            Optional<List<String>> answers = validAnswers(answersNode, errors);
            if (answers.isPresent()) {
                hashes = answers.get().stream().map(hasher::hash).toList();
            }
        }
        SettingsValidator.throwIfAny(errors);
        settings.applyUpdate(values, hashes);
        epoch.invalidate();
        return view();
    }

    void signOutEveryone() {
        settings.bumpViewerEpoch();
        epoch.invalidate();
    }

    private static Optional<List<String>> validAnswers(JsonNode node, Map<String, String> errors) {
        if (node == null || !node.isArray() || node.isEmpty() || node.size() > MAX_ANSWERS) {
            errors.put(ANSWERS_NAME, "Must be an array of 1 to " + MAX_ANSWERS + " answers");
            return Optional.empty();
        }
        List<String> normalized = new ArrayList<>();
        for (JsonNode element : node) {
            Optional<String> value = element.isTextual() ? AnswerNormalizer.normalize(element.asText())
                    : Optional.empty();
            if (value.isEmpty()) {
                errors.put(ANSWERS_NAME, "Each answer must be 1 to " + AnswerNormalizer.MAX_LENGTH
                        + " characters");
                return Optional.empty();
            }
            if (!normalized.contains(value.get())) {
                normalized.add(value.get());
            }
        }
        return Optional.of(normalized);
    }
}
