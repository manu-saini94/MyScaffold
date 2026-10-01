package com.ourstory.auth;

import com.ourstory.common.ApiException;
import com.ourstory.settings.SettingsService;
import java.time.Duration;
import java.util.List;
import org.springframework.stereotype.Service;

/**
 * Checks an unlock answer. Order matters: configuration, input validation and rate limiting all happen
 * BEFORE any PBKDF2 work, so a flood of requests cannot burn CPU.
 */
@Service
public class UnlockService {

    /** Result of an unlock attempt. */
    public sealed interface Outcome {
        record Success() implements Outcome { }
        record Failure(int attemptsRemaining) implements Outcome { }
        record RateLimited(Duration retryAfter) implements Outcome { }
        record NotConfigured() implements Outcome { }
    }

    private final SettingsService settings;
    private final AnswerHasher hasher;
    private final UnlockRateLimiter limiter;

    public UnlockService(SettingsService settings, AnswerHasher hasher, UnlockRateLimiter limiter) {
        this.settings = settings;
        this.hasher = hasher;
        this.limiter = limiter;
    }

    /** @throws ApiException 400 when the answer is empty or longer than 100 characters */
    public Outcome attempt(String clientIp, String rawAnswer) {
        List<String> hashes = settings.unlockAnswerHashes();
        if (hashes.isEmpty() || settings.unlockQuestion().isEmpty()) {
            return new Outcome.NotConfigured();
        }
        String normalized = AnswerNormalizer.normalize(rawAnswer).orElseThrow(
                () -> ApiException.badRequest("The answer must be 1 to " + AnswerNormalizer.MAX_LENGTH
                        + " characters"));
        UnlockRateLimiter.Attempt attempt = limiter.tryAcquire(clientIp);
        if (!attempt.allowed()) {
            return new Outcome.RateLimited(attempt.retryAfter());
        }
        if (hasher.matchesAny(normalized, hashes)) {
            limiter.release(clientIp, attempt);
            SecurityAudit.unlockSucceeded(clientIp);
            return new Outcome.Success();
        }
        int remaining = limiter.remaining(clientIp);
        SecurityAudit.unlockFailed(clientIp, remaining);
        return new Outcome.Failure(remaining);
    }
}
