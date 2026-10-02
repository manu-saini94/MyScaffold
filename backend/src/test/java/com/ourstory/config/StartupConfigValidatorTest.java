package com.ourstory.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ourstory.TestSupport;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.boot.diagnostics.FailureAnalysis;

class StartupConfigValidatorTest {

    private static OurStoryProperties props(String clientId, String secret, String admin, String pickerUrl,
            boolean insecure, List<String> hosts, String viewerSecret) {
        return new OurStoryProperties("./data",
                new OurStoryProperties.Google(clientId, secret, pickerUrl, hosts, insecure),
                viewerSecret, admin, "/admin",
                new OurStoryProperties.ImportJob(4, 1024, 3, 1, Duration.ofHours(2), Duration.ofMinutes(2), 0));
    }

    private static OurStoryProperties valid() {
        return props("id", "secret", "me@example.com", "https://photospicker.googleapis.com", false,
                List.of("googleusercontent.com"), null);
    }

    @Test
    void acceptsNoGoogleConfigurationAtAll() {
        OurStoryProperties none = props("", "", "", "https://photospicker.googleapis.com", false,
                List.of("googleusercontent.com"), null);
        assertThat(StartupConfigValidator.problems(none)).isEmpty();
        assertThat(StartupConfigValidator.problems(valid())).isEmpty();
        new StartupConfigValidator(valid());
    }

    @Test
    void clientIdRequiresSecretAndAdminEmail() {
        List<String> problems = StartupConfigValidator.problems(props("id", " ", null,
                "https://photospicker.googleapis.com", false, List.of("googleusercontent.com"), null));
        assertThat(problems).anyMatch(p -> p.contains("GOOGLE_CLIENT_SECRET is blank"))
                .anyMatch(p -> p.contains("ADMIN_EMAIL is blank"));
    }

    @Test
    void constructorThrowsWithAllProblemsInOneMessage() {
        OurStoryProperties bad = props("id", "", "", "https://photospicker.googleapis.com", false,
                List.of("googleusercontent.com"), null);
        assertThatThrownBy(() -> new StartupConfigValidator(bad))
                .isInstanceOf(ConfigurationProblemException.class)
                .hasMessageContaining("GOOGLE_CLIENT_SECRET").hasMessageContaining("ADMIN_EMAIL");
    }

    @Test
    void pickerUrlMustBeHttpsUnlessTheTestOverrideIsOn() {
        assertThat(StartupConfigValidator.problems(props("", "", "", "http://localhost:1", false,
                List.of("x"), null))).anyMatch(p -> p.contains("picker-base-url"));
        assertThat(StartupConfigValidator.problems(props("", "", "", "http://localhost:1", true,
                List.of("x"), null))).isEmpty();
        assertThat(StartupConfigValidator.problems(props("", "", "", "ftp://x", true, List.of("x"), null)))
                .isNotEmpty();
        assertThat(StartupConfigValidator.problems(props("", "", "", "http://a b", true, List.of("x"), null)))
                .anyMatch(p -> p.contains("not a valid URL"));
    }

    @Test
    void mediaHostsMustBeLowercaseBareHostNames() {
        for (String bad : List.of("https://googleusercontent.com", "GoogleUserContent.com", "a.com/path", "",
                "-a.com", "a..com", "a b")) {
            assertThat(StartupConfigValidator.problems(props("", "", "", "https://p.example", false,
                    List.of(bad), null))).as(bad).isNotEmpty();
        }
        assertThat(StartupConfigValidator.problems(props("", "", "", "https://p.example", false,
                List.of("googleusercontent.com", "127.0.0.1", "localhost"), null))).isEmpty();
        assertThat(StartupConfigValidator.problems(props("", "", "", "https://p.example", false,
                List.of(), null))).isNotEmpty();
    }

    @Test
    void prodRequiresALongViewerCookieSecret() {
        String ok = "x".repeat(32);
        new StartupConfigValidator.Prod(props("", "", "", "https://p.example", false, List.of("x"), ok));
        for (String bad : new String[] {null, "", "   ", "x".repeat(31)}) {
            assertThatThrownBy(() -> new StartupConfigValidator.Prod(
                    props("", "", "", "https://p.example", false, List.of("x"), bad)))
                    .isInstanceOf(ConfigurationProblemException.class).hasMessageContaining("VIEWER_COOKIE_SECRET");
        }
    }

    @Test
    void failureAnalyzerListsEveryProblemAndAnAction() {
        var cause = new ConfigurationProblemException(List.of("first problem", "second problem"));
        FailureAnalysis analysis = new ConfigurationProblemFailureAnalyzer().analyze(cause);
        assertThat(analysis.getDescription()).contains("first problem").contains("second problem");
        assertThat(analysis.getAction()).contains("README");
        assertThat(cause.problems()).hasSize(2);
    }

    @Test
    void placeholderSecretsAreRecognisedButRealOnesAreNot() {
        for (String placeholder : new String[] {"change-me", "CHANGE_ME_123", "changeme", "secret", "Password",
                "password-password", "secret1234", "change-me-secret-password"}) {
            assertThat(StartupConfigValidator.isPlaceholder(placeholder)).as(placeholder).isTrue();
        }
        for (String real : new String[] {"Zk3Qv9Lm2Xr7Ty4Wp8Hc1Nb6Jd5Fg0Sa", "x".repeat(40), "1234567890".repeat(4),
                "my-own-long-passphrase-for-viewer-cookies", "yoursecret-but-with-more-words-after"}) {
            assertThat(StartupConfigValidator.isPlaceholder(real)).as(real).isFalse();
        }
    }

    @Test
    void prodRefusesAPlaceholderSecretEvenWhenLongEnough() {
        assertThatThrownBy(() -> new StartupConfigValidator.Prod(props("", "", "", "https://p.example", false,
                List.of("x"), "change-me".repeat(5))))
                .isInstanceOf(ConfigurationProblemException.class).hasMessageContaining("placeholder");
    }
}
