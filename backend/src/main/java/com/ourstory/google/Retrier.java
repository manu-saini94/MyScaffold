package com.ourstory.google;

import java.util.concurrent.ThreadLocalRandom;
import java.util.function.Function;
import java.util.function.Supplier;

/**
 * Shared retry helper for Google calls: exponential backoff plus jitter for failures the caller marks
 * as transient (429, 5xx, IO errors). Used by both {@link MediaDownloader} and {@link PickerClient}.
 */
final class Retrier {

    /** Injectable pause so tests do not sleep. */
    @FunctionalInterface
    interface Sleeper {
        void sleep(long millis) throws InterruptedException;
    }

    /** Signals a retryable failure inside a single attempt. Carries only a short reason and a status. */
    static final class TransientFailure extends RuntimeException {
        private final String reason;
        private final int status;

        TransientFailure(String reason, int status) {
            super(reason, null, false, false);
            this.reason = reason;
            this.status = status;
        }

        String reason() {
            return reason;
        }

        /** Upstream HTTP status, or 0 for IO errors. */
        int status() {
            return status;
        }
    }

    private final int maxAttempts;
    private final long backoffBaseMillis;
    private final Sleeper sleeper;

    Retrier(int maxAttempts, long backoffBaseMillis, Sleeper sleeper) {
        this.maxAttempts = maxAttempts;
        this.backoffBaseMillis = backoffBaseMillis;
        this.sleeper = sleeper;
    }

    /**
     * Runs {@code attempt} until it succeeds, throws anything other than {@link TransientFailure}, or the
     * attempts are exhausted (then {@code exhausted} builds the exception to throw).
     */
    <T> T run(Supplier<T> attempt, Function<TransientFailure, RuntimeException> exhausted,
            Supplier<RuntimeException> interrupted) {
        for (int number = 1; ; number++) {
            try {
                return attempt.get();
            } catch (TransientFailure failure) {
                if (number >= maxAttempts) {
                    throw exhausted.apply(failure);
                }
                pause(number, interrupted);
            }
        }
    }

    private void pause(int attempt, Supplier<RuntimeException> interrupted) {
        long delay = backoffBaseMillis * (1L << Math.min(attempt - 1, 10));
        long jitter = backoffBaseMillis <= 0 ? 0 : ThreadLocalRandom.current().nextLong(backoffBaseMillis + 1);
        try {
            sleeper.sleep(delay + jitter);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw interrupted.get();
        }
    }
}
