package com.ourstory;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ourstory.config.ConfigurationProblemException;
import org.junit.jupiter.api.Test;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;

/** Real application startup: a bad configuration must stop the app with the clear configuration error. */
class StartupFailureTest {

    /** Properties go in as command-line arguments so they beat application.yml (builder properties would not). */
    private static Runner app(String db, String... properties) {
        return () -> {
            java.util.List<String> args = new java.util.ArrayList<>(java.util.List.of("--server.port=0",
                    "--spring.datasource.url=jdbc:h2:mem:" + db + ";DB_CLOSE_DELAY=-1"));
            for (String property : properties) {
                args.add("--" + property);
            }
            boolean prod = args.contains("--spring.profiles.active=prod");
            args.remove("--spring.profiles.active=prod");
            args.add("--spring.profiles.active=" + (prod ? "test,prod" : "test"));
            if (prod && args.stream().noneMatch(a -> a.startsWith("--ourstory.viewer.pbkdf2-iterations"))) {
                args.add("--ourstory.viewer.pbkdf2-iterations=600000"); // prod refuses less
            }
            return new SpringApplicationBuilder(OurStoryApplication.class).run(args.toArray(String[]::new));
        };
    }

    @FunctionalInterface
    private interface Runner {
        ConfigurableApplicationContext run();
    }

    @Test
    void clientIdWithoutSecretRefusesToStart() {
        assertThatThrownBy(() -> app("startup-fail-1", "ourstory.google.client-id=some-id",
                "ourstory.google.client-secret=", "ourstory.admin-email=me@example.com").run())
                .hasRootCauseInstanceOf(ConfigurationProblemException.class)
                .rootCause().hasMessageContaining("GOOGLE_CLIENT_SECRET is blank");
    }

    @Test
    void clientIdWithoutAdminEmailRefusesToStart() {
        assertThatThrownBy(() -> app("startup-fail-2", "ourstory.google.client-id=some-id",
                "ourstory.google.client-secret=s", "ourstory.admin-email=").run())
                .rootCause().isInstanceOf(ConfigurationProblemException.class)
                .hasMessageContaining("ADMIN_EMAIL is blank");
    }

    @Test
    void anInsecurePickerUrlRefusesToStart() {
        assertThatThrownBy(() -> app("startup-fail-3", "ourstory.google.picker-base-url=http://evil.example").run())
                .rootCause().hasMessageContaining("picker-base-url must be an https");
    }

    @Test
    void aBadPostLoginUrlRefusesToStart() {
        assertThatThrownBy(() -> app("startup-fail-4", "ourstory.post-login-url=//evil.example/x").run())
                .hasStackTraceContaining("must be a local path");
    }

    @Test
    void prodNeedsALongViewerCookieSecret() {
        assertThatThrownBy(() -> app("startup-fail-5", "spring.profiles.active=prod",
                "ourstory.viewer-cookie-secret=too-short").run())
                .rootCause().isInstanceOf(ConfigurationProblemException.class)
                .hasMessageContaining("VIEWER_COOKIE_SECRET");
        assertThatThrownBy(() -> app("startup-fail-6", "spring.profiles.active=prod").run())
                .rootCause().hasMessageContaining("VIEWER_COOKIE_SECRET");
    }

    @Test
    void prodRefusesPlaceholderSecretsAndALowWorkFactor() {
        for (String placeholder : new String[] {"change-me-change-me-change-me-change-me", "SECRET".repeat(8),
                "password1234567890password1234567890", "changeme".repeat(5)}) {
            assertThatThrownBy(() -> app("startup-fail-7", "spring.profiles.active=prod",
                    "ourstory.viewer-cookie-secret=" + placeholder).run())
                    .rootCause().isInstanceOf(ConfigurationProblemException.class)
                    .hasMessageContaining("placeholder");
        }
        assertThatThrownBy(() -> app("startup-fail-8", "spring.profiles.active=prod",
                "ourstory.viewer-cookie-secret=" + "k".repeat(40), "ourstory.viewer.pbkdf2-iterations=210000").run())
                .rootCause().hasMessageContaining("at least 600000");
    }

    @Test
    void aValidProdConfigurationStarts() {
        try (ConfigurableApplicationContext context = app("startup-ok-1", "spring.profiles.active=prod",
                "ourstory.viewer-cookie-secret=" + "k".repeat(40)).run()) {
            assertThat(context.isRunning()).isTrue();
        }
    }
}
