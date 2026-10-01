package com.ourstory.auth;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

class UnlockRateLimiterTest {

    private final MutableClock clock = new MutableClock(Instant.parse("2026-10-01T00:00:00Z"));
    private final UnlockRateLimiter limiter = limiter(5, 12, Duration.ofMinutes(10), Duration.ofMinutes(10));
    private ListAppender<ILoggingEvent> logs;
    private Logger securityLogger;

    private UnlockRateLimiter limiter(int perIp, int global, Duration window, Duration globalWindow) {
        return new UnlockRateLimiter(new ViewerProperties(null, List.of(), false, Duration.ofDays(7), 1000,
                Duration.ofSeconds(5), perIp, global, window, globalWindow), clock);
    }

    @BeforeEach
    void captureLogs() {
        securityLogger = (Logger) LoggerFactory.getLogger(SecurityAudit.LOGGER);
        logs = new ListAppender<>();
        logs.start();
        securityLogger.addAppender(logs);
        securityLogger.setLevel(Level.INFO);
    }

    @AfterEach
    void detach() {
        securityLogger.detachAppender(logs);
    }

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
    void globalCapBlocksEveryoneUntilItsOwnLongerWindowSlides() {
        UnlockRateLimiter hourly = limiter(5, 12, Duration.ofMinutes(10), Duration.ofHours(1));
        for (String ip : List.of("1.1.1.1", "2.2.2.2", "3.3.3.3")) {
            for (int i = 0; i < 4; i++) {
                assertThat(hourly.tryAcquire(ip).allowed()).isTrue();
            }
        }
        var fresh = hourly.tryAcquire("9.9.9.9");
        assertThat(fresh.allowed()).isFalse();
        assertThat(fresh.retryAfter()).isEqualTo(Duration.ofHours(1));
        assertThat(hourly.remaining("9.9.9.9")).isZero();
        clock.advance(Duration.ofMinutes(11)); // per-client windows are over, the global one is not
        assertThat(hourly.tryAcquire("9.9.9.9").allowed()).isFalse();
        clock.advance(Duration.ofMinutes(49));
        assertThat(hourly.tryAcquire("9.9.9.9").allowed()).isTrue();
    }

    @Test
    void releasingASuccessfulAttemptFreesItsSlot() {
        var attempt = limiter.tryAcquire("1.1.1.1");
        assertThat(limiter.remaining("1.1.1.1")).isEqualTo(4);
        limiter.release("1.1.1.1", attempt);
        assertThat(limiter.remaining("1.1.1.1")).isEqualTo(5);
        limiter.release("never-seen", attempt);
    }

    @Test
    void ipv6AddressesOfOneSlash64ShareOneBucketAndIpv4IsExact() {
        UnlockRateLimiter wide = limiter(5, 100, Duration.ofMinutes(10), Duration.ofMinutes(10));
        for (int i = 0; i < 5; i++) {
            assertThat(wide.tryAcquire("2001:db8:1:2:" + i + "::" + i).allowed()).isTrue();
        }
        assertThat(wide.tryAcquire("2001:db8:1:2:ffff:ffff:ffff:ffff").allowed()).isFalse();
        assertThat(wide.tryAcquire("2001:db8:1:3::1").allowed()).isTrue(); // another /64
        for (int i = 0; i < 5; i++) {
            assertThat(wide.tryAcquire("1.2.3.4").allowed()).isTrue();
        }
        assertThat(wide.tryAcquire("1.2.3.4").allowed()).isFalse();
        assertThat(wide.tryAcquire("1.2.3.5").allowed()).isTrue();
        assertThat(wide.remaining("2001:db8:1:2::9")).isZero();
    }

    @Test
    void globalTripIsLoggedOncePerTripNotPerRequest() {
        UnlockRateLimiter tiny = limiter(50, 3, Duration.ofMinutes(10), Duration.ofMinutes(10));
        for (int i = 0; i < 3; i++) {
            tiny.tryAcquire("1.1." + i + ".1");
        }
        for (int i = 0; i < 20; i++) {
            assertThat(tiny.tryAcquire("8.8.8." + i).allowed()).isFalse();
        }
        assertThat(warnings()).hasSize(1);
        assertThat(warnings().get(0)).contains("scope=global");
        clock.advance(Duration.ofMinutes(10));
        for (int i = 0; i < 3; i++) {
            assertThat(tiny.tryAcquire("1.1." + i + ".1").allowed()).isTrue();
        }
        assertThat(tiny.tryAcquire("7.7.7.7").allowed()).isFalse();
        assertThat(tiny.tryAcquire("7.7.7.7").allowed()).isFalse();
        assertThat(warnings()).hasSize(2); // a NEW trip logs again
    }

    @Test
    void perClientTripIsLoggedOnceWithAMaskedAddress() {
        UnlockRateLimiter wide = limiter(5, 100, Duration.ofMinutes(10), Duration.ofMinutes(10));
        for (int i = 0; i < 12; i++) {
            wide.tryAcquire("203.0.113.77");
        }
        List<String> warnings = warnings();
        assertThat(warnings).hasSize(1);
        assertThat(warnings.get(0)).contains("scope=client").contains("203.0.*.*").doesNotContain("113.77");
    }

    @Test
    void resetClearsPerClientAndGlobalCountersAndRearmsTheTripLog() {
        UnlockRateLimiter tiny = limiter(2, 3, Duration.ofMinutes(10), Duration.ofMinutes(10));
        for (int i = 0; i < 3; i++) {
            tiny.tryAcquire("1.1." + i + ".1");
        }
        assertThat(tiny.tryAcquire("9.9.9.9").allowed()).isFalse();
        assertThat(warnings()).hasSize(1);
        tiny.reset();
        assertThat(tiny.remaining("1.1.0.1")).isEqualTo(2);
        for (int i = 0; i < 3; i++) {
            assertThat(tiny.tryAcquire("2.2." + i + ".1").allowed()).isTrue();
        }
        assertThat(tiny.tryAcquire("9.9.9.9").allowed()).isFalse();
        assertThat(warnings()).hasSize(2);
    }

    @Test
    void parallelThreadsAtTheCapReserveExactlyTheCap() throws Exception {
        int cap = 30;
        UnlockRateLimiter shared = limiter(1000, cap, Duration.ofMinutes(10), Duration.ofHours(1));
        int threads = 64;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch go = new CountDownLatch(1);
        AtomicInteger reserved = new AtomicInteger();
        List<Future<?>> futures = new ArrayList<>();
        for (int t = 0; t < threads; t++) {
            String ip = "10.0." + t + ".1";
            futures.add(pool.submit(() -> {
                go.await();
                for (int i = 0; i < 3; i++) {
                    if (shared.tryAcquire(ip).allowed()) {
                        reserved.incrementAndGet();
                    }
                }
                return null;
            }));
        }
        go.countDown();
        for (Future<?> f : futures) {
            f.get(30, TimeUnit.SECONDS);
        }
        pool.shutdown();
        assertThat(reserved.get()).isEqualTo(cap);
        assertThat(shared.tryAcquire("99.9.9.9").allowed()).isFalse();
    }

    private List<String> warnings() {
        return logs.list.stream().filter(e -> e.getLevel() == Level.WARN).map(ILoggingEvent::getFormattedMessage)
                .toList();
    }
}
