package com.ourstory.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.ourstory.media.MediaRepository;
import com.ourstory.settings.SettingKeys;
import com.ourstory.settings.SettingsService;
import com.ourstory.settings.SettingsValidator;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
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
    private final MediaRepository media;
    private final com.fasterxml.jackson.databind.ObjectMapper mapper;

    AdminSettingsService(SettingsService settings, SettingsValidator validator, AnswerHasher hasher,
            ViewerEpoch epoch, MediaRepository media, com.fasterxml.jackson.databind.ObjectMapper mapper) {
        this.media = media;
        this.mapper = mapper;
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

    /**
     * Partial update. Validates everything first; nothing is written when anything is invalid. Writing the
     * question or answers it already has changes nothing and does not sign viewers out.
     */
    Map<String, Object> update(Map<String, JsonNode> changes) {
        Map<String, JsonNode> rest = new LinkedHashMap<>(changes);
        JsonNode answersNode = rest.remove(ANSWERS_NAME);
        Map<String, String> errors = new LinkedHashMap<>();
        Map<String, String> values = new LinkedHashMap<>(validator.collect(rest, errors));
        checkHeroMedia(values, errors);
        List<String> answers = null;
        if (changes.containsKey(ANSWERS_NAME)) {
            answers = validAnswers(answersNode, errors).orElse(null);
        }
        SettingsValidator.throwIfAny(errors);
        List<String> hashes = answers == null || sameAsStored(answers) ? null : hashAll(answers);
        values.remove(SettingKeys.UNLOCK_QUESTION, settings.unlockQuestion().orElse(null));
        if (!values.isEmpty() || hashes != null) {
            settings.applyUpdate(values, hashes);
            epoch.invalidate();
            SecurityAudit.settingsChanged(changedNames(changes, values, hashes != null));
        }
        return view();
    }

    private List<String> hashAll(List<String> answers) {
        return answers.stream().map(hasher::hash).toList();
    }

    /** The key names (never values) that were actually written. */
    private static List<String> changedNames(Map<String, JsonNode> requested, Map<String, String> written,
            boolean answersWritten) {
        Set<String> names = requested.keySet().stream().filter(n -> !ANSWERS_NAME.equals(n))
                .filter(n -> written.containsKey(storageKey(n))).collect(Collectors.toCollection(java.util.TreeSet::new));
        if (answersWritten) {
            names.add(ANSWERS_NAME);
        }
        return List.copyOf(names);
    }

    private static String storageKey(String name) {
        return SettingsValidator.QUESTION_NAME.equals(name) ? SettingKeys.UNLOCK_QUESTION
                : SettingKeys.EDITABLE.get(name);
    }

    /** True when the stored hashes already accept exactly these answers (so replacing them is a no-op). */
    private boolean sameAsStored(List<String> answers) {
        List<String> stored = settings.unlockAnswerHashes();
        return stored.size() == answers.size() && stored.stream().allMatch(hasher::isCurrentFormat)
                && answers.stream().allMatch(a -> hasher.matchesAny(a, stored));
    }

    /** heroMediaIds must be unique and every id must be an existing photo. */
    private void checkHeroMedia(Map<String, String> values, Map<String, String> errors) {
        String json = values.get(SettingKeys.HERO_MEDIA_IDS);
        if (json == null) {
            return;
        }
        try {
            List<String> ids = mapper.readValue(json, new com.fasterxml.jackson.core.type.TypeReference<>() { });
            if (ids.size() != Set.copyOf(ids).size()) {
                errors.put("heroMediaIds", "Entries must be unique");
            } else if (ids.stream().anyMatch(id -> !media.existsById(id))) {
                errors.put("heroMediaIds", "Some photos do not exist");
            }
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            errors.put("heroMediaIds", "Must be an array of ids");
        }
    }

    void signOutEveryone() {
        settings.bumpViewerEpoch();
        epoch.invalidate();
        SecurityAudit.signedOutEveryone();
    }

    private static Optional<List<String>> validAnswers(JsonNode node, Map<String, String> errors) {
        if (node == null || !node.isArray() || node.isEmpty() || node.size() > MAX_ANSWERS) {
            errors.put(ANSWERS_NAME, "Must be an array of 1 to " + MAX_ANSWERS + " answers");
            return Optional.empty();
        }
        List<String> normalized = new ArrayList<>();
        for (JsonNode element : node) {
            Optional<String> value = element.isTextual() ? AnswerNormalizer.normalizeForStorage(element.asText())
                    : Optional.empty();
            if (value.isEmpty()) {
                errors.put(ANSWERS_NAME, "Each answer must be " + AnswerNormalizer.MIN_STORED_LENGTH + " to "
                        + AnswerNormalizer.MAX_LENGTH + " characters (case and spaces are ignored)");
                return Optional.empty();
            }
            if (!normalized.contains(value.get())) {
                normalized.add(value.get());
            }
        }
        return Optional.of(normalized);
    }
}
