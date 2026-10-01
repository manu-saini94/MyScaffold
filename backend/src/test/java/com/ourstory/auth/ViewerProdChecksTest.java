package com.ourstory.auth;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ourstory.config.ConfigurationProblemException;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;

class ViewerProdChecksTest {

    private static ViewerProperties props(int iterations) {
        return new ViewerProperties(null, List.of(), false, Duration.ofDays(30), iterations,
                Duration.ofSeconds(5), 5, 60, Duration.ofMinutes(10));
    }

    @Test
    void prodRefusesALowWorkFactor() {
        assertThatThrownBy(() -> new ViewerProdChecks(props(1000))).isInstanceOf(ConfigurationProblemException.class);
        assertThatCode(() -> new ViewerProdChecks(props(210_000))).doesNotThrowAnyException();
    }
}
