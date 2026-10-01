package com.ourstory.auth;

import java.util.Collection;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Security event log (logger {@code com.ourstory.security}). Events carry masked client addresses and setting
 * key names only: never answers, cookies, hashes or secrets.
 */
public final class SecurityAudit {

    static final String LOGGER = "com.ourstory.security";
    private static final Logger log = LoggerFactory.getLogger(LOGGER);

    private SecurityAudit() {
    }

    static void unlockSucceeded(String ip) {
        log.info("unlock succeeded client={}", ClientIps.mask(ip));
    }

    static void unlockFailed(String ip, int attemptsRemaining) {
        log.info("unlock failed client={} attemptsRemaining={}", ClientIps.mask(ip), attemptsRemaining);
    }

    /** @param maskedClient already masked address, or null for the global cap */
    static void limiterTripped(String scope, String maskedClient) {
        log.warn("unlock rate limiter tripped scope={} client={}; further attempts are refused until the "
                + "window slides or an admin resets it", scope, maskedClient == null ? "all" : maskedClient);
    }

    static void rateLimitsReset() {
        log.info("unlock rate limits reset by an admin");
    }

    static void settingsChanged(Collection<String> keyNames) {
        log.info("admin settings changed keys={}", keyNames);
    }

    static void signedOutEveryone() {
        log.info("admin signed out every viewer (epoch bumped)");
    }
}
