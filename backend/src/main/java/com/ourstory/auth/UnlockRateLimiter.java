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
 * In-memory sliding-window limiter for FAILED unlock attempts: N per client key (IPv4 exact, IPv6 /64) within
 * one window, and a global cap within a longer window. An attempt is reserved BEFORE the expensive hash check
 * (so parallel requests cannot all slip through) and released again when it turns out to be a success.
 * Memory is bounded by Caffeine. When a limit trips, ONE warning is logged per trip (not per refused request).
 * It fails closed: while the global cap is reached nobody can unlock until the window slides or an admin calls
 * {@link #reset()}.
 */
@Component
public class UnlockRateLimiter {

    static final int MAX_TRACKED_IPS = 10_000;

    /** Result of {@link #tryAcquire}: either a reservation (stamp) or a refusal with a wait time. */
    public record Attempt(boolean allowed, Duration retryAfter, long stamp) {
    }

    /** Failure timestamps within one sliding window, plus whether the current trip was already logged. */
    private static final class Window {
        private final Deque<Long> stamps = new ArrayDeque<>();
        private final int limit;
        private final long windowMillis;
        private boolean tripLogged;

        Window(int limit, long windowMillis) {
            this.limit = limit;
            this.windowMillis = windowMillis;
        }

        void prune(long now) {
            while (!stamps.isEmpty() && stamps.peekFirst() <= now - windowMillis) {
                stamps.removeFirst();
            }
            if (stamps.size() < limit) {
                tripLogged = false;
            }
        }

        /** Milliseconds until the oldest counted failure leaves the window; 0 when under the limit. */
        long waitFor(long now) {
            return stamps.size() < limit ? 0 : Math.max(1, stamps.peekFirst() + windowMillis - now);
        }

        int remaining() {
            return Math.max(0, limit - stamps.size());
        }

        /** True exactly once per trip. */
        boolean markTripLogged() {
            boolean first = !tripLogged;
            tripLogged = true;
            return first;
        }
    }

    private final Object lock = new Object();
    private final Cache<String, Window> perKey;
    private final Window global;
    private final Clock clock;
    private final long windowMillis;
    private final int maxPerIp;

    @Autowired
    public UnlockRateLimiter(ViewerProperties props, ObjectProvider<Clock> clock) {
        this(props, clock.getIfAvailable(Clock::systemUTC));
    }

    UnlockRateLimiter(ViewerProperties props, Clock clock) {
        this.clock = clock;
        this.windowMillis = props.failureWindow().toMillis();
        this.maxPerIp = props.maxFailuresPerIp();
        this.global = new Window(props.maxFailuresGlobal(), props.globalFailureWindow().toMillis());
        this.perKey = Caffeine.newBuilder()
                .maximumSize(MAX_TRACKED_IPS)
                .expireAfterAccess(props.failureWindow())
                .ticker(() -> TimeUnit.MILLISECONDS.toNanos(clock.millis()))
                .build();
    }

    public Attempt tryAcquire(String ip) {
        String key = ClientIps.limiterKey(ip);
        synchronized (lock) {
            long now = clock.millis();
            Window mine = window(key);
            mine.prune(now);
            global.prune(now);
            long wait = Math.max(mine.waitFor(now), global.waitFor(now));
            if (wait > 0) {
                logTrip(mine, ip, now);
                return new Attempt(false, Duration.ofSeconds(Math.max(1, (wait + 999) / 1000)), 0);
            }
            mine.stamps.addLast(now);
            global.stamps.addLast(now);
            return new Attempt(true, Duration.ZERO, now);
        }
    }

    /** A reserved attempt turned out to be a success: it must not count as a failure. */
    public void release(String ip, Attempt attempt) {
        synchronized (lock) {
            Window mine = perKey.getIfPresent(ClientIps.limiterKey(ip));
            if (mine != null) {
                mine.stamps.removeFirstOccurrence(attempt.stamp());
            }
            global.stamps.removeFirstOccurrence(attempt.stamp());
        }
    }

    /** Failed attempts this client can still make before being blocked (bounded by the global cap too). */
    public int remaining(String ip) {
        synchronized (lock) {
            long now = clock.millis();
            Window mine = window(ClientIps.limiterKey(ip));
            mine.prune(now);
            global.prune(now);
            return Math.min(mine.remaining(), global.remaining());
        }
    }

    /** Admin recovery: forgets every counted failure (per client and global). */
    public void reset() {
        synchronized (lock) {
            perKey.invalidateAll();
            global.stamps.clear();
            global.tripLogged = false;
        }
    }

    private Window window(String key) {
        return perKey.get(key, k -> new Window(maxPerIp, windowMillis));
    }

    private void logTrip(Window mine, String ip, long now) {
        if (global.waitFor(now) > 0) {
            if (global.markTripLogged()) {
                SecurityAudit.limiterTripped("global", null);
            }
        } else if (mine.markTripLogged()) {
            SecurityAudit.limiterTripped("client", ClientIps.mask(ip));
        }
    }
}
