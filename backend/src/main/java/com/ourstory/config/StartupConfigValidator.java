package com.ourstory.config;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Fails startup with one clear message for configurations that would otherwise fail late or fail open.
 * Generic rules run in every profile; {@link Prod} adds the rules that only production needs, so dev and
 * tests still start without a viewer cookie secret.
 */
@Component
public class StartupConfigValidator {

    static final int MIN_VIEWER_SECRET_LENGTH = 32;
    /** Words that make a secret a placeholder when nothing but digits and these words is left. */
    private static final List<String> PLACEHOLDER_WORDS = List.of("changeme", "secret", "password");
    private static final Pattern HOST =
            Pattern.compile("^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$");

    public StartupConfigValidator(OurStoryProperties props) {
        List<String> problems = problems(props);
        if (!problems.isEmpty()) {
            throw new ConfigurationProblemException(problems);
        }
    }

    static List<String> problems(OurStoryProperties props) {
        List<String> problems = new ArrayList<>();
        OurStoryProperties.Google google = props.google();
        if (google.configured()) {
            if (isBlank(google.clientSecret())) {
                problems.add("GOOGLE_CLIENT_ID is set but GOOGLE_CLIENT_SECRET is blank");
            }
            if (isBlank(props.adminEmail())) {
                problems.add("GOOGLE_CLIENT_ID is set but ADMIN_EMAIL is blank (nobody could ever be admin)");
            }
        }
        checkPickerUrl(google, problems);
        checkHosts(google.allowedMediaHosts(), problems);
        return problems;
    }

    private static void checkPickerUrl(OurStoryProperties.Google google, List<String> problems) {
        String scheme;
        try {
            scheme = URI.create(google.pickerBaseUrl()).getScheme();
        } catch (IllegalArgumentException e) {
            problems.add("ourstory.google.picker-base-url is not a valid URL");
            return;
        }
        boolean ok = "https".equalsIgnoreCase(scheme)
                || (google.allowInsecureHttp() && "http".equalsIgnoreCase(scheme));
        if (!ok) {
            problems.add("ourstory.google.picker-base-url must be an https:// URL");
        }
    }

    private static void checkHosts(List<String> hosts, List<String> problems) {
        if (hosts == null || hosts.isEmpty()) {
            problems.add("ourstory.google.allowed-media-hosts must list at least one host");
            return;
        }
        for (String host : hosts) {
            if (host == null || !HOST.matcher(host).matches()) {
                problems.add("ourstory.google.allowed-media-hosts entry '" + host
                        + "' must be a lowercase host name without scheme or path");
            }
        }
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    /** True when the secret is only digits, separators and placeholder words such as "change-me" or "secret". */
    static boolean isPlaceholder(String secret) {
        String reduced = secret.toLowerCase(java.util.Locale.ROOT).replaceAll("[^a-z0-9]", "");
        String stripped = reduced;
        for (String word : PLACEHOLDER_WORDS) {
            stripped = stripped.replace(word, "");
        }
        return !stripped.equals(reduced) && stripped.replaceAll("[0-9]", "").isEmpty();
    }

    /** Production-only rules. */
    @Component
    @Profile("prod")
    public static class Prod {

        public Prod(OurStoryProperties props) {
            String secret = props.viewerCookieSecret();
            if (isBlank(secret) || secret.length() < MIN_VIEWER_SECRET_LENGTH) {
                throw new ConfigurationProblemException(List.of(
                        "VIEWER_COOKIE_SECRET must be set to at least " + MIN_VIEWER_SECRET_LENGTH
                                + " characters in the prod profile (for example `openssl rand -base64 48`)"));
            }
            if (isPlaceholder(secret)) {
                throw new ConfigurationProblemException(List.of(
                        "VIEWER_COOKIE_SECRET looks like a placeholder (change-me, secret, password ...); "
                                + "generate a random one, for example `openssl rand -base64 48`"));
            }
        }
    }
}
