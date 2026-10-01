package com.ourstory.auth;

import com.ourstory.settings.SettingKeys;
import com.ourstory.settings.SettingsService;
import com.ourstory.settings.SettingsValidator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.stereotype.Component;

/**
 * Stores the unlock question and hashed answers from the environment at startup. It runs when the singletons are
 * ready but BEFORE the web server starts, so there is no window in which requests see "not configured".
 * Idempotent: once hashes exist the environment is ignored unless OURSTORY_UNLOCK_FORCE_RESET=true; a forced
 * reset whose values already match what is stored changes nothing (no epoch bump). Invalid environment values
 * skip the reset with a warning. Answers are never logged.
 */
@Component
public class UnlockBootstrap implements SmartInitializingSingleton {

    static final int MAX_ANSWERS = 10;
    private static final Logger log = LoggerFactory.getLogger(UnlockBootstrap.class);

    private final ViewerProperties props;
    private final SettingsService settings;
    private final AnswerHasher hasher;
    private final ViewerEpoch epoch;

    public UnlockBootstrap(ViewerProperties props, SettingsService settings, AnswerHasher hasher,
            ViewerEpoch epoch) {
        this.props = props;
        this.settings = settings;
        this.hasher = hasher;
        this.epoch = epoch;
    }

    @Override
    public void afterSingletonsInstantiated() {
        bootstrap();
    }

    void bootstrap() {
        Optional<String> question = validQuestion();
        List<String> answers = normalizedAnswers();
        boolean envPresent = question.isPresent() && !answers.isEmpty();
        List<String> storedHashes = settings.unlockAnswerHashes();
        boolean stored = !storedHashes.isEmpty();
        if (envPresent && (!stored || props.unlockForceReset())) {
            store(question.get(), answers, storedHashes);
        } else if (envPresent) {
            log.info("Unlock credentials already stored; ignoring OURSTORY_UNLOCK_* (set "
                    + "OURSTORY_UNLOCK_FORCE_RESET=true to replace them)");
        } else if (props.unlockForceReset()) {
            log.warn("OURSTORY_UNLOCK_FORCE_RESET is true but the reset was SKIPPED: OURSTORY_UNLOCK_QUESTION "
                    + "or OURSTORY_UNLOCK_ANSWERS is missing or invalid (answers need 4 to 100 characters "
                    + "once spaces are ignored, at most {}; the question 1 to 300 characters)", MAX_ANSWERS);
        }
        warnAboutHashFormats();
        if (!settings.unlockConfigured()) {
            log.warn("UNLOCK IS NOT CONFIGURED: nobody can unlock the site (fail closed). Set "
                    + "OURSTORY_UNLOCK_QUESTION and OURSTORY_UNLOCK_ANSWERS, or use the admin settings API.");
        }
    }

    private void store(String question, List<String> answers, List<String> storedHashes) {
        boolean unchanged = props.unlockForceReset() && settings.unlockQuestion().filter(question::equals).isPresent()
                && sameAnswers(answers, storedHashes);
        if (unchanged) {
            log.info("OURSTORY_UNLOCK_FORCE_RESET is true but the stored credentials already match the "
                    + "environment; nothing changed and no viewer was signed out. Remove the variable.");
            return;
        }
        List<String> hashes = answers.stream().map(hasher::hash).toList();
        settings.applyUpdate(Map.of(SettingKeys.UNLOCK_QUESTION, question), hashes);
        epoch.invalidate();
        log.info("Unlock credentials stored from the environment ({} answer(s))", hashes.size());
        if (props.unlockForceReset()) {
            log.warn("OURSTORY_UNLOCK_FORCE_RESET is true: credentials were replaced and all viewers were "
                    + "signed out. Remove it after this start.");
        }
    }

    /** Same answers, in the current hash format, nothing extra stored. */
    private boolean sameAnswers(List<String> answers, List<String> storedHashes) {
        return storedHashes.size() == answers.size() && storedHashes.stream().allMatch(hasher::isCurrentFormat)
                && answers.stream().allMatch(a -> hasher.matchesAny(a, storedHashes));
    }

    private void warnAboutHashFormats() {
        List<String> hashes = settings.unlockAnswerHashes();
        if (hashes.isEmpty()) {
            return;
        }
        boolean unverifiable = !hasher.pepperAvailable() && hashes.stream().anyMatch(AnswerHasher::isPeppered);
        boolean outdated = hasher.pepperAvailable() && hashes.stream().anyMatch(h -> !hasher.isCurrentFormat(h));
        if (unverifiable) {
            log.warn("Stored unlock hashes need re-setting: they were peppered with VIEWER_COOKIE_SECRET, which "
                    + "is not configured now, so no answer can match (fail closed).");
        } else if (outdated) {
            log.warn("Stored unlock hashes need re-setting: some use the legacy un-peppered format. Re-set the "
                    + "answers through the admin API or OURSTORY_UNLOCK_FORCE_RESET=true.");
        }
    }

    private Optional<String> validQuestion() {
        String raw = props.unlockQuestion() == null ? "" : props.unlockQuestion().strip();
        if (raw.isEmpty()) {
            return Optional.empty();
        }
        try {
            return Optional.of(SettingsValidator.validQuestion(raw));
        } catch (IllegalArgumentException e) {
            log.warn("OURSTORY_UNLOCK_QUESTION is invalid ({}); ignoring the environment", e.getMessage());
            return Optional.empty();
        }
    }

    private List<String> normalizedAnswers() {
        List<String> raw = props.unlockAnswers() == null ? List.of() : props.unlockAnswers();
        List<String> normalized = raw.stream()
                .map(AnswerNormalizer::normalizeForStorage).flatMap(Optional::stream).distinct().toList();
        if (normalized.size() != raw.size()) {
            log.warn("Some OURSTORY_UNLOCK_ANSWERS entries were empty, shorter than {} characters, too long or "
                    + "duplicates and were skipped", AnswerNormalizer.MIN_STORED_LENGTH);
        }
        if (normalized.size() > MAX_ANSWERS) {
            log.warn("OURSTORY_UNLOCK_ANSWERS lists more than {} answers; ignoring the environment", MAX_ANSWERS);
            return List.of();
        }
        return normalized;
    }
}
