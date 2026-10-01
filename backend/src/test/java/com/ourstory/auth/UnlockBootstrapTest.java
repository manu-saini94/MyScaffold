package com.ourstory.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.ourstory.settings.SettingKeys;
import com.ourstory.settings.SettingsService;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;

/** Bootstrap rules: env absent, env present, already stored, forced reset. Real H2, real hashing. */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:ourstory-bootstrap;DB_CLOSE_DELAY=-1",
        "ourstory.viewer-cookie-secret=" + ViewerTestSupport.SECRET})
@ActiveProfiles("test")
@DirtiesContext
@ExtendWith(OutputCaptureExtension.class)
class UnlockBootstrapTest {

    @Autowired SettingsService settings;
    @Autowired AnswerHasher hasher;
    @Autowired ViewerEpoch epoch;
    @Autowired UnlockBootstrap beanInstance;

    private UnlockBootstrap bootstrap(String question, List<String> answers, boolean force) {
        ViewerProperties props = new ViewerProperties(question, answers, force, Duration.ofDays(7), 1000,
                Duration.ofSeconds(5), 5, 30, Duration.ofMinutes(10), Duration.ofHours(1));
        return new UnlockBootstrap(props, settings, hasher, epoch);
    }

    private void clear() {
        settings.applyUpdate(Map.of(SettingKeys.UNLOCK_QUESTION, "x"), List.of());
    }

    @Test
    void runsBeforeTheWebServerStartsAsASmartInitializingSingleton() {
        assertThat(beanInstance).isInstanceOf(SmartInitializingSingleton.class);
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
        assertThat(settings.unlockAnswerHashes()).allMatch(h -> h.startsWith("pbkdf2-sha256-p1$"));
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
    void forcedResetWithMatchingValuesChangesNothingAndKeepsViewersSignedIn(CapturedOutput output) {
        clear();
        bootstrap("Same?", List.of("Sample", "other answer"), false).bootstrap();
        long epochBefore = settings.viewerEpoch();
        List<String> hashesBefore = settings.unlockAnswerHashes();

        bootstrap("Same?", List.of("other answer", "SAMPLE"), true).bootstrap();

        assertThat(settings.viewerEpoch()).isEqualTo(epochBefore);
        assertThat(settings.unlockAnswerHashes()).isEqualTo(hashesBefore);
        assertThat(output.getAll()).contains("already match the environment");
        // A different question with the same answers is a real change.
        bootstrap("Other?", List.of("other answer", "SAMPLE"), true).bootstrap();
        assertThat(settings.viewerEpoch()).isGreaterThan(epochBefore);
        assertThat(settings.unlockQuestion()).contains("Other?");
    }

    @Test
    void forcedResetWithInvalidEnvironmentIsSkippedWithAWarning(CapturedOutput output) {
        clear();
        bootstrap("Keep?", List.of("original"), false).bootstrap();
        long epochBefore = settings.viewerEpoch();
        List<String> hashesBefore = settings.unlockAnswerHashes();

        bootstrap("Keep?", List.of(), true).bootstrap();
        bootstrap("Keep?", List.of("abc", "  "), true).bootstrap(); // shorter than 4 characters
        bootstrap("", List.of("longenough"), true).bootstrap();
        bootstrap("bad\u0007question", List.of("longenough"), true).bootstrap();
        bootstrap("q".repeat(301), List.of("longenough"), true).bootstrap();

        assertThat(settings.unlockAnswerHashes()).isEqualTo(hashesBefore);
        assertThat(settings.viewerEpoch()).isEqualTo(epochBefore);
        assertThat(settings.unlockQuestion()).contains("Keep?");
        assertThat(output.getAll()).contains("reset was SKIPPED").contains("OURSTORY_UNLOCK_QUESTION is invalid");
    }

    @Test
    void tooManyShortOrInvalidAnswersAreIgnored() {
        clear();
        bootstrap("Q?", List.of("1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999", "aaaa",
                "bbbb"), false).bootstrap();
        assertThat(settings.unlockConfigured()).isFalse();
        bootstrap("Q?", List.of("", "   ", "abc"), false).bootstrap();
        assertThat(settings.unlockConfigured()).isFalse();
        clear();
    }

    @Test
    void warnsWhenStoredHashesAreLegacyOrCannotBeVerified(CapturedOutput output) {
        clear();
        AnswerHasher noSecret = new AnswerHasher(new ViewerProperties(null, List.of(), false, Duration.ofDays(7),
                1000, Duration.ofSeconds(5), 5, 30, Duration.ofMinutes(10), Duration.ofHours(1)), "");
        // Legacy hash stored while a secret is configured now: needs re-setting.
        settings.applyUpdate(Map.of(SettingKeys.UNLOCK_QUESTION, "Q?"), List.of(noSecret.hash("legacyanswer")));
        bootstrap("", List.of(), false).bootstrap();
        assertThat(output.getAll()).contains("legacy un-peppered format");

        // Peppered hash stored while no secret is configured: cannot match, warn.
        settings.applyUpdate(Map.of(), List.of(hasher.hash("pepperedanswer")));
        UnlockBootstrap blind = new UnlockBootstrap(new ViewerProperties(null, List.of(), false,
                Duration.ofDays(7), 1000, Duration.ofSeconds(5), 5, 30, Duration.ofMinutes(10), Duration.ofHours(1)),
                settings, noSecret, epoch);
        blind.bootstrap();
        assertThat(output.getAll()).contains("which is not configured now");
        clear();
    }
}
