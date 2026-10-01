package com.ourstory.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

class UnlockRateLimiterTest {

    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-01T00:00:00Z"));
    private final UnlockRateLimiter limiter = new UnlockRateLimiter(
            new ViewerProperties(null, List.of(), false, Duration.ofDays(30), 1000, Duration.ofSeconds(5),
                    5, 12, Duration.ofMinutes(10)), clock);

    @Test
    void blocksTheSixthFailureFromOneIpAndReportsRetryAfter() {
        for (int i = 0; i < 5; i++) {
            assertThat(limiter.tryAcquire("1.1.1.1").allowed()).isTrue();
            clock.advance(Duration.ofSeconds(1));
        }
        var blocked = limiter.tryAcquire("1.1.1.1");
        assertThat(blocked.allowed()).isFalse();
        // The oldest failure was 5s ago, so it leaves the window in 595s.
        assertThat(blocked.retryAfter()).isEqualTo(Duration.ofSeconds(595));
        assertThat(limiter.tryAcquire("2.2.2.2").allowed()).isTrue();
    }

    @Test
    void windowSlides() {
        for (int i = 0; i < 5; i++) {
            limiter.tryAcquire("1.1.1.1");
        }
        assertThat(limiter.tryAcquire("1.1.1.1").allowed()).isFalse();
        clock.advance(Duration.ofMinutes(10));
        assertThat(limiter.tryAcquire("1.1.1.1").allowed()).isTrue();
    }

    @Test
    void remainingCountsDownAndNeverGoesNegative() {
        assertThat(limiter.remaining("1.1.1.1")).isEqualTo(5);
        limiter.tryAcquire("1.1.1.1");
        limiter.tryAcquire("1.1.1.1");
        assertThat(limiter.remaining("1.1.1.1")).isEqualTo(3);
        for (int i = 0; i < 10; i++) {
            limiter.tryAcquire("1.1.1.1");
        }
        assertThat(limiter.remaining("1.1.1.1")).isZero();
    }

    @Test
    void globalCapBlocksEveryone() {
        for (String ip : List.of("1.1.1.1", "2.2.2.2", "3.3.3.3")) {
            for (int i = 0; i < 4; i++) {
                assertThat(limiter.tryAcquire(ip).allowed()).isTrue();
            }
        }
        var fresh = limiter.tryAcquire("9.9.9.9");
        assertThat(fresh.allowed()).isFalse();
        assertThat(fresh.retryAfter()).isEqualTo(Duration.ofMinutes(10));
        assertThat(limiter.remaining("9.9.9.9")).isZero();
        clock.advance(Duration.ofMinutes(10));
        assertThat(limiter.tryAcquire("9.9.9.9").allowed()).isTrue();
    }

    @Test
    void releasingASuccessfulAttemptFreesItsSlot() {
        var attempt = limiter.tryAcquire("1.1.1.1");
        assertThat(limiter.remaining("1.1.1.1")).isEqualTo(4);
        limiter.release("1.1.1.1", attempt);
        assertThat(limiter.remaining("1.1.1.1")).isEqualTo(5);
        limiter.release("never-seen", attempt);
    }
}
