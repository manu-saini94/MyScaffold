package com.ourstory.config;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

/**
 * Typed view of the "ourstory.*" properties; blank secrets mean "not configured". Cross-field rules
 * (client id needs secret and admin email, https-only URLs, prod secret length) live in
 * {@link StartupConfigValidator}.
 *
 * <p>{@code viewerCookieSecret} is not used by Phase 1 code; it is kept for the Phase 2 viewer cookie.
 */
@Validated
@ConfigurationProperties(prefix = "ourstory")
public record OurStoryProperties(
        @DefaultValue("./data") @NotBlank String dataDir,
        @Valid @DefaultValue Google google,
        String viewerCookieSecret,
        String adminEmail,
        @DefaultValue("/admin")
        @Pattern(regexp = "^/(?!/)[A-Za-z0-9._~/-]*$", message = "must be a local path made of [A-Za-z0-9._~/-]")
        String postLoginUrl,
        @Valid @DefaultValue ImportJob importJob) {

    public record Google(
            String clientId,
            String clientSecret,
            @DefaultValue("https://photospicker.googleapis.com") @NotBlank String pickerBaseUrl,
            @DefaultValue("googleusercontent.com") List<String> allowedMediaHosts,
            /** TEST-ONLY: allows http:// picker/media URLs (real local test servers). Never set in prod. */
            @DefaultValue("false") boolean allowInsecureHttp) {

        public boolean configured() {
            return clientId != null && !clientId.isBlank();
        }
    }

    public record ImportJob(
            @DefaultValue("4") @Min(1) @Max(16) int concurrency,
            @DefaultValue("15728640") @Min(1024) long maxDownloadBytes,
            @DefaultValue("4") @Min(1) @Max(8) int maxAttempts,
            @DefaultValue("500") @Min(0) long backoffBaseMillis,
            /** Wall-clock limit for a whole import job; afterwards it is FAILED('Import timed out'). */
            @DefaultValue("2h") @NotNull Duration jobTimeout,
            /** Wall-clock limit for reading one image body (a trickling server cannot hold a worker). */
            @DefaultValue("2m") @NotNull Duration downloadTimeout,
            /** Imports write nothing when the volume has less usable space than this. */
            @DefaultValue("209715200") @Min(0) long minFreeBytes) {
    }
}
