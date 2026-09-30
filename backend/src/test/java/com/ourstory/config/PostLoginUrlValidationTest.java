package com.ourstory.config;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.Validation;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;

class PostLoginUrlValidationTest {

    private static int violations(String url) {
        var props = new OurStoryProperties("./data",
                new OurStoryProperties.Google("", "", "https://p.example", List.of("x"), false), null, null, url,
                new OurStoryProperties.ImportJob(4, 1024, 3, 1, Duration.ofHours(1), Duration.ofMinutes(1), 0),
                new OurStoryProperties.DevTools(false));
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            return factory.getValidator().validate(props).size();
        }
    }

    @Test
    void acceptsOnlyLocalPathsMadeOfSafeCharacters() {
        assertThat(violations("/dev/import.html")).isZero();
        assertThat(violations("/admin/x_y-z~1.2")).isZero();
        for (String bad : List.of("//evil.example", "https://evil.example", "/a?b=1", "/a b", "/a\\b", "/a#f",
                "dev/import.html", "/a%2f")) {
            assertThat(violations(bad)).as(bad).isPositive();
        }
    }
}
