package com.ourstory.auth;

import com.ourstory.settings.SettingKeys;
import com.ourstory.settings.SettingsService;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * Stores the unlock question and hashed answers from the environment at startup. Idempotent: once hashes
 * exist the environment is ignored unless OURSTORY_UNLOCK_FORCE_RESET=true. Answers are never logged.
 */
@Component
public class UnlockBootstrap implements ApplicationRunner {

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
    public void run(ApplicationArguments args) {
        bootstrap();
    }

    void bootstrap() {
        String question = props.unlockQuestion() == null ? "" : props.unlockQuestion().strip();
        List<String> answers = normalizedAnswers();
        boolean envPresent = !question.isEmpty() && !answers.isEmpty();
        boolean stored = !settings.unlockAnswerHashes().isEmpty();
        if (envPresent && (!stored || props.unlockForceReset())) {
            List<String> hashes = answers.stream().map(hasher::hash).toList();
            settings.applyUpdate(Map.of(SettingKeys.UNLOCK_QUESTION, question), hashes);
            epoch.invalidate();
            log.info("Unlock credentials stored from the environment ({} answer(s))", hashes.size());
            if (props.unlockForceReset()) {
                log.warn("OURSTORY_UNLOCK_FORCE_RESET is true: credentials were replaced and all viewers were "
                        + "signed out. Remove it after this start.");
            }
        } else if (envPresent) {
            log.info("Unlock credentials already stored; ignoring OURSTORY_UNLOCK_* (set "
                    + "OURSTORY_UNLOCK_FORCE_RESET=true to replace them)");
        }
        if (!settings.unlockConfigured()) {
            log.warn("UNLOCK IS NOT CONFIGURED: nobody can unlock the site (fail closed). Set "
                    + "OURSTORY_UNLOCK_QUESTION and OURSTORY_UNLOCK_ANSWERS, or use the admin settings API.");
        }
    }

    private List<String> normalizedAnswers() {
        List<String> raw = props.unlockAnswers() == null ? List.of() : props.unlockAnswers();
        List<String> normalized = raw.stream()
                .map(AnswerNormalizer::normalize).flatMap(java.util.Optional::stream).distinct().toList();
        if (normalized.size() != raw.size()) {
            log.warn("Some OURSTORY_UNLOCK_ANSWERS entries were empty, too long or duplicates and were skipped");
        }
        if (normalized.size() > MAX_ANSWERS) {
            log.warn("OURSTORY_UNLOCK_ANSWERS lists more than {} answers; ignoring the environment", MAX_ANSWERS);
            return List.of();
        }
        return normalized;
    }
}
