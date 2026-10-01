package com.ourstory.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class AnswerHasherTest {

    private static final String SECRET = "0123456789012345678901234567890123456789";
    private static final String OTHER_SECRET = "abcdefghijabcdefghijabcdefghijabcdefghij";

    private static ViewerProperties props(int iterations) {
        return new ViewerProperties(null, List.of(), false, Duration.ofDays(7), iterations,
                Duration.ofSeconds(5), 5, 30, Duration.ofMinutes(10), Duration.ofHours(1));
    }

    private final AnswerHasher hasher = new AnswerHasher(props(1000), SECRET);
    private final AnswerHasher unpeppered = new AnswerHasher(props(1000), "");

    @Test
    void peppered_hashes_use_the_p1_format_with_random_salt() {
        String a = hasher.hash("sample");
        String b = hasher.hash("sample");
        String[] parts = a.split("\\$");
        assertThat(parts).hasSize(4);
        assertThat(parts[0]).isEqualTo("pbkdf2-sha256-p1");
        assertThat(parts[1]).isEqualTo("1000");
        assertThat(Base64.getDecoder().decode(parts[2])).hasSize(16);
        assertThat(Base64.getDecoder().decode(parts[3])).hasSize(32);
        assertThat(a).isNotEqualTo(b).doesNotContain("sample");
        assertThat(hasher.pepperAvailable()).isTrue();
        assertThat(hasher.isCurrentFormat(a)).isTrue();
        assertThat(AnswerHasher.isPeppered(a)).isTrue();
    }

    @Test
    void blank_secret_stores_legacy_unpeppered_hashes() {
        String legacy = unpeppered.hash("sample");
        assertThat(legacy).startsWith("pbkdf2-sha256$");
        assertThat(unpeppered.pepperAvailable()).isFalse();
        assertThat(unpeppered.isCurrentFormat(legacy)).isTrue();
        assertThat(AnswerHasher.isPeppered(legacy)).isFalse();
        assertThat(new AnswerHasher(props(1000), (String) null).pepperAvailable()).isFalse();
    }

    @Test
    void default_work_factor_is_at_least_the_production_minimum() {
        assertThat(ViewerProperties.MIN_PROD_ITERATIONS).isEqualTo(600_000);
    }

    @Test
    void verifies_against_all_hashes() {
        List<String> hashes = List.of(hasher.hash("sample"), hasher.hash("test"));
        assertThat(hasher.matchesAny("sample", hashes)).isTrue();
        assertThat(hasher.matchesAny("test", hashes)).isTrue();
        assertThat(hasher.matchesAny("nope", hashes)).isFalse();
        assertThat(hasher.matchesAny("sample", List.of())).isFalse();
    }

    @Test
    void database_only_theft_cannot_verify_peppered_hashes_without_the_secret() {
        String stolen = hasher.hash("sample");
        // An attacker who has the rows but not VIEWER_COOKIE_SECRET (no secret, or any other secret) fails.
        assertThat(unpeppered.matchesAny("sample", List.of(stolen))).isFalse();
        assertThat(new AnswerHasher(props(1000), OTHER_SECRET).matchesAny("sample", List.of(stolen))).isFalse();
        assertThat(new AnswerHasher(props(1000), SECRET).matchesAny("sample", List.of(stolen))).isTrue();
    }

    @Test
    void the_version_tag_selects_the_algorithm_and_cannot_be_swapped() {
        String peppered = hasher.hash("sample");
        String retagged = peppered.replaceFirst("^pbkdf2-sha256-p1", "pbkdf2-sha256");
        assertThat(hasher.matchesAny("sample", List.of(retagged))).isFalse();
        String legacy = unpeppered.hash("sample");
        String forged = legacy.replaceFirst("^pbkdf2-sha256", "pbkdf2-sha256-p1");
        assertThat(hasher.matchesAny("sample", List.of(forged))).isFalse();
    }

    @Test
    void legacy_hashes_still_verify_with_or_without_a_secret() {
        String legacy = unpeppered.hash("sample");
        assertThat(hasher.matchesAny("sample", List.of(legacy))).isTrue();
        assertThat(unpeppered.matchesAny("sample", List.of(legacy))).isTrue();
        assertThat(hasher.isCurrentFormat(legacy)).isFalse();
    }

    @Test
    void honours_the_iteration_count_stored_in_the_string() {
        String old = new AnswerHasher(props(2000), SECRET).hash("sample");
        assertThat(hasher.matchesAny("sample", List.of(old))).isTrue();
    }

    @Test
    void malformed_or_unknown_version_values_never_match_or_throw() {
        String good = hasher.hash("sample");
        for (String bad : List.of("", "x", "a$b$c$d", "pbkdf2-sha256$abc$AA==$AA==", "pbkdf2-sha256$0$AA==$AA==",
                "pbkdf2-sha256$99999999$AA==$AA==", "pbkdf2-sha256$1000$***$***", good + "$extra",
                "pbkdf2-sha256-p2$1000$AA==$AA==", "pbkdf2-sha256-p1$abc$AA==$AA==",
                "pbkdf2-sha256-p1$99999999$AA==$AA==", "PBKDF2-SHA256-P1$1000$AA==$AA==", "$$$")) {
            assertThat(hasher.matchesAny("sample", List.of(bad))).as(bad).isFalse();
        }
        assertThat(hasher.matchesAny("sample", List.of("x", good))).isTrue();
        assertThat(hasher.isCurrentFormat(null)).isFalse();
        assertThat(AnswerHasher.isPeppered(null)).isFalse();
    }

    @Test
    void constant_time_helper_compares_bytes() {
        assertThat(AnswerHasher.constantTimeEquals(new byte[] {1, 2}, new byte[] {1, 2})).isTrue();
        assertThat(AnswerHasher.constantTimeEquals(new byte[] {1, 2}, new byte[] {1, 3})).isFalse();
        assertThat(AnswerHasher.constantTimeEquals(new byte[] {1, 2}, new byte[] {1})).isFalse();
    }

    @Test
    void at_most_two_verifications_run_at_once() throws Exception {
        AtomicInteger running = new AtomicInteger();
        AtomicInteger peak = new AtomicInteger();
        AnswerHasher slow = new AnswerHasher(props(1000), SECRET) {
            @Override
            boolean matches(String normalized, String stored) {
                int now = running.incrementAndGet();
                peak.accumulateAndGet(now, Math::max);
                try {
                    Thread.sleep(40);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    running.decrementAndGet();
                }
                return false;
            }
        };
        int threads = 8;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch go = new CountDownLatch(1);
        for (int i = 0; i < threads; i++) {
            pool.submit(() -> {
                go.await();
                return slow.matchesAny("x", List.of("a", "b"));
            });
        }
        go.countDown();
        pool.shutdown();
        assertThat(pool.awaitTermination(30, TimeUnit.SECONDS)).isTrue();
        assertThat(peak.get()).isLessThanOrEqualTo(AnswerHasher.VERIFY_PERMITS).isGreaterThanOrEqualTo(1);
    }

    @Test
    void an_interrupted_waiter_fails_closed() {
        String stored = hasher.hash("sample");
        Thread.currentThread().interrupt();
        try {
            assertThat(hasher.matchesAny("sample", List.of(stored))).isFalse();
        } finally {
            Thread.interrupted();
        }
    }
}
