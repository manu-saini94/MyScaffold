package com.ourstory.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.ourstory.settings.SettingKeys;
import com.ourstory.settings.SettingsService;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;

/** Bootstrap rules: env absent, env present, already stored, forced reset. Real H2, real hashing. */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:ourstory-bootstrap;DB_CLOSE_DELAY=-1",
        "ourstory.viewer.pbkdf2-iterations=1000"})
@ActiveProfiles("test")
@DirtiesContext
@ExtendWith(OutputCaptureExtension.class)
class UnlockBootstrapTest {

    @Autowired SettingsService settings;
    @Autowired AnswerHasher hasher;
    @Autowired ViewerEpoch epoch;

    private UnlockBootstrap bootstrap(String question, List<String> answers, boolean force) {
        ViewerProperties props = new ViewerProperties(question, answers, force, Duration.ofDays(30), 1000,
                Duration.ofSeconds(5), 5, 60, Duration.ofMinutes(10));
        return new UnlockBootstrap(props, settings, hasher, epoch);
    }

    private void clear() {
        settings.applyUpdate(Map.of(SettingKeys.UNLOCK_QUESTION, "x"), List.of());
    }

    @Test
    void lifecycle(CapturedOutput output) {
        // 1. Nothing in the environment: stays unconfigured and warns clearly.
        clear();
        bootstrap("", List.of(), false).bootstrap();
        assertThat(settings.unlockConfigured()).isFalse();
        assertThat(output.getAll()).contains("UNLOCK IS NOT CONFIGURED");

        // 2. Question without answers is not enough.
        bootstrap("Q?", List.of(), false).bootstrap();
        assertThat(settings.unlockConfigured()).isFalse();

        // 3. Environment present and nothing stored: hashes stored, plain answers never stored or logged.
        long epochBefore = settings.viewerEpoch();
        bootstrap("First?", List.of("Sample", " sam ple ", "Secret Two"), false).bootstrap();
        assertThat(settings.unlockQuestion()).contains("First?");
        assertThat(settings.unlockAnswerHashes()).hasSize(2); // duplicate after normalisation is dropped
        assertThat(hasher.matchesAny("sample", settings.unlockAnswerHashes())).isTrue();
        assertThat(hasher.matchesAny("secrettwo", settings.unlockAnswerHashes())).isTrue();
        assertThat(String.join(",", settings.unlockAnswerHashes())).doesNotContain("Sample");
        assertThat(settings.viewerEpoch()).isGreaterThan(epochBefore);
        assertThat(output.getAll()).doesNotContain("Secret Two").doesNotContain("secrettwo");

        // 4. Already stored: the environment is ignored.
        long epochStored = settings.viewerEpoch();
        List<String> stored = settings.unlockAnswerHashes();
        bootstrap("Changed?", List.of("different"), false).bootstrap();
        assertThat(settings.unlockQuestion()).contains("First?");
        assertThat(settings.unlockAnswerHashes()).isEqualTo(stored);
        assertThat(settings.viewerEpoch()).isEqualTo(epochStored);

        // 5. Forced reset replaces everything and signs viewers out.
        bootstrap("Changed?", List.of("different"), true).bootstrap();
        assertThat(settings.unlockQuestion()).contains("Changed?");
        assertThat(hasher.matchesAny("different", settings.unlockAnswerHashes())).isTrue();
        assertThat(hasher.matchesAny("sample", settings.unlockAnswerHashes())).isFalse();
        assertThat(settings.viewerEpoch()).isGreaterThan(epochStored);
        assertThat(output.getAll()).contains("FORCE_RESET");
    }

    @Test
    void tooManyOrInvalidAnswersAreIgnored() {
        clear();
        bootstrap("Q?", List.of("1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"), false).bootstrap();
        assertThat(settings.unlockConfigured()).isFalse();
        bootstrap("Q?", List.of("", "   "), false).bootstrap();
        assertThat(settings.unlockConfigured()).isFalse();
        clear();
    }
}
