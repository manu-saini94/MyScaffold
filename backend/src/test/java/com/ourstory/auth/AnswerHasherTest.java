package com.ourstory.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.Base64;
import java.util.List;
import org.junit.jupiter.api.Test;

class AnswerHasherTest {

    private static ViewerProperties props(int iterations) {
        return new ViewerProperties(null, List.of(), false, Duration.ofDays(30), iterations,
                Duration.ofSeconds(5), 5, 60, Duration.ofMinutes(10));
    }

    private final AnswerHasher hasher = new AnswerHasher(props(1000));

    @Test
    void usesTheDocumentedFormatWithRandomSalt() {
        String a = hasher.hash("sample");
        String b = hasher.hash("sample");
        String[] parts = a.split("\\$");
        assertThat(parts).hasSize(4);
        assertThat(parts[0]).isEqualTo("pbkdf2-sha256");
        assertThat(parts[1]).isEqualTo("1000");
        assertThat(Base64.getDecoder().decode(parts[2])).hasSize(16);
        assertThat(Base64.getDecoder().decode(parts[3])).hasSize(32);
        assertThat(a).isNotEqualTo(b);
        assertThat(a).doesNotContain("sample");
    }

    @Test
    void defaultWorkFactorIsAtLeastTheProductionMinimum() {
        assertThat(ViewerProperties.MIN_PROD_ITERATIONS).isEqualTo(210_000);
    }

    @Test
    void verifiesAgainstAllHashes() {
        List<String> hashes = List.of(hasher.hash("sample"), hasher.hash("test"));
        assertThat(hasher.matchesAny("sample", hashes)).isTrue();
        assertThat(hasher.matchesAny("test", hashes)).isTrue();
        assertThat(hasher.matchesAny("nope", hashes)).isFalse();
        assertThat(hasher.matchesAny("sample", List.of())).isFalse();
    }

    @Test
    void honoursTheIterationCountStoredInTheString() {
        String old = new AnswerHasher(props(2000)).hash("sample");
        assertThat(hasher.matchesAny("sample", List.of(old))).isTrue();
    }

    @Test
    void malformedStoredHashesNeverMatchOrThrow() {
        String good = hasher.hash("sample");
        for (String bad : List.of("", "x", "a$b$c$d", "pbkdf2-sha256$abc$AA==$AA==", "pbkdf2-sha256$0$AA==$AA==",
                "pbkdf2-sha256$99999999$AA==$AA==", "pbkdf2-sha256$1000$***$***", good + "$extra")) {
            assertThat(hasher.matchesAny("sample", List.of(bad))).as(bad).isFalse();
        }
        assertThat(hasher.matchesAny("sample", List.of("x", good))).isTrue();
    }

    @Test
    void constantTimeHelperComparesBytes() {
        assertThat(AnswerHasher.constantTimeEquals(new byte[] {1, 2}, new byte[] {1, 2})).isTrue();
        assertThat(AnswerHasher.constantTimeEquals(new byte[] {1, 2}, new byte[] {1, 3})).isFalse();
        assertThat(AnswerHasher.constantTimeEquals(new byte[] {1, 2}, new byte[] {1})).isFalse();
    }
}
