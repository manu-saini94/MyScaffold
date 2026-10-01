package com.ourstory.settings;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Typed access to application settings. Writes go through {@link SettingsValidator} or the explicit
 * credential methods; the unlock question and answer hashes are never part of {@link #publicView()}.
 */
@Service
public class SettingsService {

    private static final Logger log = LoggerFactory.getLogger(SettingsService.class);
    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() { };

    private final SettingsRepository repository;
    private final ObjectMapper mapper;
    private final Clock clock;

    @Autowired
    public SettingsService(SettingsRepository repository, ObjectMapper mapper, ObjectProvider<Clock> clock) {
        this(repository, mapper, clock.getIfAvailable(Clock::systemUTC));
    }

    SettingsService(SettingsRepository repository, ObjectMapper mapper, Clock clock) {
        this.repository = repository;
        this.mapper = mapper;
        this.clock = clock;
    }

    // --- typed getters (non-secret) -------------------------------------------------------------

    public String appTitle() {
        return required(SettingKeys.APP_TITLE);
    }

    public String tagline() {
        return required(SettingKeys.TAGLINE);
    }

    public String defaultTheme() {
        return required(SettingKeys.DEFAULT_THEME);
    }

    public LocalDate specialDate() {
        return LocalDate.parse(required(SettingKeys.SPECIAL_DATE));
    }

    public String herName() {
        return required(SettingKeys.HER_NAME);
    }

    public String myName() {
        return required(SettingKeys.MY_NAME);
    }

    public List<String> easterEggNicknames() {
        return list(SettingKeys.EASTER_EGG_NICKNAMES);
    }

    public List<String> heroMediaIds() {
        return list(SettingKeys.HERO_MEDIA_IDS);
    }

    /** Current viewer epoch; viewer cookies carrying another value are invalid. */
    public long viewerEpoch() {
        return Long.parseLong(required(SettingKeys.VIEWER_EPOCH));
    }

    // --- unlock credentials (secret) --------------------------------------------------------------

    public Optional<String> unlockQuestion() {
        return repository.find(SettingKeys.UNLOCK_QUESTION).filter(q -> !q.isBlank());
    }

    /** Stored PBKDF2 hash strings (never answers). Empty when unlock is not configured. */
    public List<String> unlockAnswerHashes() {
        return repository.find(SettingKeys.UNLOCK_ANSWER_HASHES).map(this::parseList).orElse(List.of());
    }

    public boolean unlockConfigured() {
        return unlockQuestion().isPresent() && !unlockAnswerHashes().isEmpty();
    }

    // --- reads for the admin API -------------------------------------------------------------------

    /** Typed, non-secret settings keyed by their admin API names. */
    public Map<String, Object> publicView() {
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("appTitle", appTitle());
        view.put("tagline", tagline());
        view.put("defaultTheme", defaultTheme());
        view.put("specialDate", specialDate().toString());
        view.put("herName", herName());
        view.put("myName", myName());
        view.put("easterEggNicknames", easterEggNicknames());
        view.put("heroMediaIds", heroMediaIds());
        return view;
    }

    // --- writes ----------------------------------------------------------------------------------------

    /**
     * Applies validated storage values atomically. When the unlock question or the answer hashes change,
     * the viewer epoch is bumped in the same transaction so every existing viewer cookie stops working.
     *
     * @param validated storage key to value (may include {@link SettingKeys#UNLOCK_QUESTION})
     * @param newHashes replacement answer hashes, or null to keep the stored ones
     */
    @Transactional
    public void applyUpdate(Map<String, String> validated, List<String> newHashes) {
        OffsetDateTime now = now();
        validated.forEach((key, value) -> repository.upsert(key, value, now));
        if (newHashes != null) {
            repository.upsert(SettingKeys.UNLOCK_ANSWER_HASHES, toJson(newHashes), now);
        }
        if (newHashes != null || validated.containsKey(SettingKeys.UNLOCK_QUESTION)) {
            bumpEpochAt(now);
        }
    }

    /** Invalidates every viewer cookie ever issued. @return the new epoch */
    @Transactional
    public long bumpViewerEpoch() {
        return bumpEpochAt(now());
    }

    private long bumpEpochAt(OffsetDateTime now) {
        return repository.increment(SettingKeys.VIEWER_EPOCH, now);
    }

    private OffsetDateTime now() {
        return OffsetDateTime.now(clock);
    }

    private String required(String key) {
        return repository.find(key)
                .orElseThrow(() -> new IllegalStateException("Setting '" + key + "' is missing"));
    }

    private List<String> list(String key) {
        return parseList(required(key));
    }

    private List<String> parseList(String json) {
        try {
            return List.copyOf(mapper.readValue(json, STRING_LIST));
        } catch (JsonProcessingException | RuntimeException e) {
            log.warn("A stored settings list is not valid JSON; treating it as empty");
            return List.of();
        }
    }

    private String toJson(List<String> values) {
        try {
            return mapper.writeValueAsString(values);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Cannot serialise settings list", e);
        }
    }
}
