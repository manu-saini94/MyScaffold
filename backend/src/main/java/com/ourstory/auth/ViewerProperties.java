package com.ourstory.auth;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

/**
 * Viewer unlock configuration ("ourstory.viewer.*"). The question and answers are only a bootstrap input
 * (env OURSTORY_UNLOCK_QUESTION / OURSTORY_UNLOCK_ANSWERS, comma-separated); the hashes live in the settings
 * table. The tuning values exist so tests can run without sleeping or burning CPU; defaults are the policy.
 * pbkdf2Iterations below 210000 is refused in the prod profile.
 */
@Validated
@ConfigurationProperties(prefix = "ourstory.viewer")
public record ViewerProperties(
        String unlockQuestion,
        @DefaultValue List<String> unlockAnswers,
        @DefaultValue("false") boolean unlockForceReset,
        @DefaultValue("30d") @NotNull Duration cookieTtl,
        @DefaultValue("210000") @Min(1000) int pbkdf2Iterations,
        @DefaultValue("5s") @NotNull Duration epochCacheTtl,
        @DefaultValue("5") @Min(1) int maxFailuresPerIp,
        @DefaultValue("60") @Min(1) int maxFailuresGlobal,
        @DefaultValue("10m") @NotNull Duration failureWindow) {

    public static final int MIN_PROD_ITERATIONS = 210_000;
}
