package com.ourstory.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;

/** Answer length policy, property defaults and their limits. */
class ViewerPolicyTest {

    @Test
    void storedAnswersNeedFourNormalisedCharactersButAttemptsOfAnyLengthAreCompared() {
        assertThat(AnswerNormalizer.normalizeForStorage("a b c")).isEmpty();
        assertThat(AnswerNormalizer.normalizeForStorage("abc")).isEmpty();
        assertThat(AnswerNormalizer.normalizeForStorage("  Sa mp  ")).contains("samp");
        assertThat(AnswerNormalizer.normalizeForStorage("Sample")).contains("sample");
        assertThat(AnswerNormalizer.normalizeForStorage("a".repeat(101))).isEmpty();
        assertThat(AnswerNormalizer.normalizeForStorage(null)).isEmpty();
        // Attempts: 1 to 100 characters still normalise.
        assertThat(AnswerNormalizer.normalize("a")).contains("a");
        assertThat(AnswerNormalizer.normalize("a".repeat(100))).isPresent();
    }

    private static ViewerProperties bind(java.util.Map<String, String> values) {
        return new Binder(new MapConfigurationPropertySource(values))
                .bind("ourstory.viewer", Bindable.of(ViewerProperties.class)).get();
    }

    @Test
    void defaultsAreThePolicy() {
        ViewerProperties props = bind(java.util.Map.of("ourstory.viewer.unlock-question", "q"));
        assertThat(props.cookieTtl()).isEqualTo(Duration.ofDays(7));
        assertThat(props.pbkdf2Iterations()).isEqualTo(600_000);
        assertThat(props.maxFailuresPerIp()).isEqualTo(5);
        assertThat(props.failureWindow()).isEqualTo(Duration.ofMinutes(10));
        assertThat(props.maxFailuresGlobal()).isEqualTo(30);
        assertThat(props.globalFailureWindow()).isEqualTo(Duration.ofHours(1));
    }

    @Test
    void nonPositiveDurationsAreRefused() {
        for (String name : List.of("cookie-ttl", "epoch-cache-ttl", "failure-window", "global-failure-window")) {
            assertThatThrownBy(() -> bind(java.util.Map.of("ourstory.viewer." + name, "0s")))
                    .hasStackTraceContaining(name + " must be positive");
        }
        assertThatThrownBy(() -> bind(java.util.Map.of("ourstory.viewer.failure-window", "-5m")))
                .hasStackTraceContaining("must be positive");
    }
}
