package com.ourstory.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Random;
import org.junit.jupiter.api.Test;

class UlidGeneratorTest {

    /** SecureRandom whose output is always zero, to force the increment/overflow paths. */
    static final class ZeroRandom extends SecureRandom {
        @Override
        public void nextBytes(byte[] bytes) {
            java.util.Arrays.fill(bytes, (byte) 0);
        }
    }

    @Test
    void producesValidLowercaseFreeCrockfordIds() {
        UlidGenerator gen = new UlidGenerator();
        String id = gen.next();
        assertThat(id).hasSize(26).matches("^[0-9A-HJKMNP-TV-Z]{26}$");
        assertThat(UlidGenerator.isValid(id)).isTrue();
    }

    @Test
    void encodesTheClockTimestamp() {
        Clock fixed = Clock.fixed(Instant.parse("2026-01-02T03:04:05.123Z"), ZoneOffset.UTC);
        String id = new UlidGenerator(fixed, new SecureRandom()).next();
        assertThat(UlidGenerator.timestampOf(id)).isEqualTo(fixed.millis());
    }

    @Test
    void isMonotonicWithinTheSameMillisecond() {
        Clock fixed = Clock.fixed(Instant.parse("2026-01-02T03:04:05.123Z"), ZoneOffset.UTC);
        UlidGenerator gen = new UlidGenerator(fixed, new SecureRandom());
        List<String> ids = new ArrayList<>();
        for (int i = 0; i < 2000; i++) {
            ids.add(gen.next());
        }
        assertThat(ids).isSorted();
        assertThat(new HashSet<>(ids)).hasSize(ids.size());
    }

    @Test
    void neverGoesBackwardsWhenTheClockDoes() {
        long[] now = {2_000_000L};
        Clock clock = new Clock() {
            public java.time.ZoneId getZone() { return ZoneOffset.UTC; }
            public Clock withZone(java.time.ZoneId zone) { return this; }
            public Instant instant() { return Instant.ofEpochMilli(now[0]); }
        };
        UlidGenerator gen = new UlidGenerator(clock, new SecureRandom());
        String first = gen.next();
        now[0] = 1_000_000L;
        String second = gen.next();
        assertThat(second).isGreaterThan(first);
    }

    @Test
    void sortsByCreationTimeAcrossMilliseconds() {
        long[] now = {1_000L};
        Clock clock = new Clock() {
            public java.time.ZoneId getZone() { return ZoneOffset.UTC; }
            public Clock withZone(java.time.ZoneId zone) { return this; }
            public Instant instant() { return Instant.ofEpochMilli(now[0]); }
        };
        UlidGenerator gen = new UlidGenerator(clock, new SecureRandom());
        String a = gen.next();
        now[0] = 1_001L;
        String b = gen.next();
        assertThat(b).isGreaterThan(a);
    }

    @Test
    void rejectsMalformedIds() {
        assertThat(UlidGenerator.isValid(null)).isFalse();
        assertThat(UlidGenerator.isValid("x")).isFalse();
        assertThat(UlidGenerator.isValid("../../etc/passwd")).isFalse();
        assertThat(UlidGenerator.isValid("0".repeat(25) + "U")).isFalse(); // U is not in the alphabet
        assertThat(UlidGenerator.isValid("8" + "0".repeat(25))).isFalse();   // first char > 7 overflows 128 bits
        assertThatThrownBy(() -> UlidGenerator.timestampOf("nope")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void supportsTheLargestTimestampButNotBeyond() {
        long max = (1L << 48) - 1;
        UlidGenerator edge = new UlidGenerator(Clock.fixed(Instant.ofEpochMilli(max), ZoneOffset.UTC),
                new ZeroRandom());
        String id = edge.next();
        assertThat(UlidGenerator.timestampOf(id)).isEqualTo(max);
        assertThat(UlidGenerator.isValid(id)).isTrue();
        UlidGenerator beyond = new UlidGenerator(Clock.fixed(Instant.ofEpochMilli(max + 1), ZoneOffset.UTC),
                new ZeroRandom());
        assertThatThrownBy(beyond::next).isInstanceOf(IllegalStateException.class);
    }
}
