package com.ourstory.auth;

import jakarta.validation.constraints.Max;
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
 * pbkdf2Iterations below 600000 is refused in the prod profile.
 *
 * <p>Failure limits: {@code maxFailuresPerIp} per client key within {@code failureWindow}, and
 * {@code maxFailuresGlobal} over all clients within {@code globalFailureWindow}.
 */
@Validated
@ConfigurationProperties(prefix = "ourstory.viewer")
public record ViewerProperties(
        String unlockQuestion,
        @DefaultValue List<String> unlockAnswers,
        @DefaultValue("false") boolean unlockForceReset,
        @DefaultValue("7d") @NotNull Duration cookieTtl,
        @DefaultValue("600000") @Min(1000) @Max(5_000_000) int pbkdf2Iterations,
        @DefaultValue("5s") @NotNull Duration epochCacheTtl,
        @DefaultValue("5") @Min(1) @Max(1000) int maxFailuresPerIp,
        @DefaultValue("30") @Min(1) @Max(100_000) int maxFailuresGlobal,
        @DefaultValue("10m") @NotNull Duration failureWindow,
        @DefaultValue("1h") @NotNull Duration globalFailureWindow) {

    public static final int MIN_PROD_ITERATIONS = 600_000;

    public ViewerProperties {
        requirePositive(cookieTtl, "cookie-ttl");
        requirePositive(epochCacheTtl, "epoch-cache-ttl");
        requirePositive(failureWindow, "failure-window");
        requirePositive(globalFailureWindow, "global-failure-window");
    }

    private static void requirePositive(Duration value, String name) {
        if (value != null && (value.isZero() || value.isNegative())) {
            throw new IllegalArgumentException("ourstory.viewer." + name + " must be positive");
        }
    }
}
