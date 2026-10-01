package com.ourstory.auth;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import java.time.Clock;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * In-memory sliding-window limiter for FAILED unlock attempts: N per client IP and a global cap, both over
 * the same window. An attempt is reserved BEFORE the expensive hash check (so parallel requests cannot all
 * slip through) and released again when it turns out to be a success. Memory is bounded by Caffeine.
 */
@Component
public class UnlockRateLimiter {

    static final int MAX_TRACKED_IPS = 10_000;

    /** Result of {@link #tryAcquire}: either a reservation (stamp) or a refusal with a wait time. */
    public record Attempt(boolean allowed, Duration retryAfter, long stamp) {
    }

    private final Object lock = new Object();
    private final Cache<String, Deque<Long>> perIp;
    private final Deque<Long> global = new ArrayDeque<>();
    private final Clock clock;
    private final long windowMillis;
    private final int maxPerIp;
    private final int maxGlobal;

    @Autowired
    public UnlockRateLimiter(ViewerProperties props, ObjectProvider<Clock> clock) {
        this(props, clock.getIfAvailable(Clock::systemUTC));
    }

    UnlockRateLimiter(ViewerProperties props, Clock clock) {
        this.clock = clock;
        this.windowMillis = props.failureWindow().toMillis();
        this.maxPerIp = props.maxFailuresPerIp();
        this.maxGlobal = props.maxFailuresGlobal();
        this.perIp = Caffeine.newBuilder()
                .maximumSize(MAX_TRACKED_IPS)
                .expireAfterAccess(props.failureWindow())
                .ticker(() -> TimeUnit.MILLISECONDS.toNanos(clock.millis()))
                .build();
    }

    public Attempt tryAcquire(String ip) {
        synchronized (lock) {
            long now = clock.millis();
            Deque<Long> mine = perIp.get(ip, key -> new ArrayDeque<>());
            prune(mine, now);
            prune(global, now);
            long wait = Math.max(waitFor(mine, maxPerIp, now), waitFor(global, maxGlobal, now));
            if (wait > 0) {
                return new Attempt(false, Duration.ofSeconds(Math.max(1, (wait + 999) / 1000)), 0);
            }
            mine.addLast(now);
            global.addLast(now);
            return new Attempt(true, Duration.ZERO, now);
        }
    }

    /** A reserved attempt turned out to be a success: it must not count as a failure. */
    public void release(String ip, Attempt attempt) {
        synchronized (lock) {
            Deque<Long> mine = perIp.getIfPresent(ip);
            if (mine != null) {
                mine.removeFirstOccurrence(attempt.stamp());
            }
            global.removeFirstOccurrence(attempt.stamp());
        }
    }

    /** Failed attempts this client can still make before being blocked (bounded by the global cap too). */
    public int remaining(String ip) {
        synchronized (lock) {
            long now = clock.millis();
            Deque<Long> mine = perIp.get(ip, key -> new ArrayDeque<>());
            prune(mine, now);
            prune(global, now);
            return Math.max(0, Math.min(maxPerIp - mine.size(), maxGlobal - global.size()));
        }
    }

    private void prune(Deque<Long> stamps, long now) {
        while (!stamps.isEmpty() && stamps.peekFirst() <= now - windowMillis) {
            stamps.removeFirst();
        }
    }

    /** Milliseconds until the oldest counted failure leaves the window; 0 when under the limit. */
    private long waitFor(Deque<Long> stamps, int limit, long now) {
        if (stamps.size() < limit) {
            return 0;
        }
        return Math.max(1, stamps.peekFirst() + windowMillis - now);
    }
}
