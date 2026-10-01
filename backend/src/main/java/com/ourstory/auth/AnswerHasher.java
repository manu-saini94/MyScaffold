package com.ourstory.auth;

import com.ourstory.config.OurStoryProperties;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.List;
import java.util.concurrent.Semaphore;
import javax.crypto.Mac;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * PBKDF2WithHmacSHA256 hashing of NORMALISED answers with a server-side pepper.
 *
 * <p>Current form: {@code pbkdf2-sha256-p1$iterations$saltBase64$hashBase64}. The PBKDF2 password is the Base64
 * of {@code HMAC-SHA256(pepperKey, normalizedAnswer)} where {@code pepperKey = HMAC-SHA256(VIEWER_COOKIE_SECRET,
 * "our-story:unlock-pepper:v1")}, so a stolen database alone cannot be brute-forced offline. Legacy form
 * {@code pbkdf2-sha256$iterations$saltBase64$hashBase64} (no pepper) is still verified, and is what gets stored
 * when no secret is configured (non-prod only: an ephemeral key would orphan the hashes on every restart).
 * Peppered hashes cannot be verified without the configured secret (fail closed).
 *
 * <p>Verification runs under a small semaphore so parallel attempts cannot occupy every carrier thread.
 */
@Component
public class AnswerHasher {

    static final String LEGACY_PREFIX = "pbkdf2-sha256";
    static final String PEPPERED_PREFIX = "pbkdf2-sha256-p1";
    static final String PEPPER_CONTEXT = "our-story:unlock-pepper:v1";
    static final int SALT_BYTES = 16;
    static final int HASH_BITS = 256;
    static final int VERIFY_PERMITS = 2;
    /** Upper bound on iterations read from a stored string (a corrupted row must not burn the CPU). */
    static final int MAX_STORED_ITERATIONS = 5_000_000;
    private static final Logger log = LoggerFactory.getLogger(AnswerHasher.class);

    private final SecureRandom random = new SecureRandom();
    private final Semaphore verifyPermits = new Semaphore(VERIFY_PERMITS, true);
    private final int iterations;
    private final byte[] pepperKey;

    @Autowired
    public AnswerHasher(ViewerProperties props, OurStoryProperties app) {
        this(props, app.viewerCookieSecret());
    }

    AnswerHasher(ViewerProperties props, String secret) {
        this.iterations = props.pbkdf2Iterations();
        this.pepperKey = secret == null || secret.isBlank() ? null
                : hmac(secret.getBytes(StandardCharsets.UTF_8), PEPPER_CONTEXT.getBytes(StandardCharsets.UTF_8));
        if (pepperKey == null) {
            log.warn("VIEWER_COOKIE_SECRET is blank: unlock answers are hashed WITHOUT the server-side pepper "
                    + "(acceptable for local development only)");
        }
    }

    /** True when new hashes are peppered, i.e. a secret is configured. */
    public boolean pepperAvailable() {
        return pepperKey != null;
    }

    /** True when {@code stored} is in the format {@link #hash} would produce right now. */
    public boolean isCurrentFormat(String stored) {
        return stored != null && stored.startsWith((pepperKey != null ? PEPPERED_PREFIX : LEGACY_PREFIX) + "$");
    }

    /** True when {@code stored} is peppered (and so unverifiable without the configured secret). */
    public static boolean isPeppered(String stored) {
        return stored != null && stored.startsWith(PEPPERED_PREFIX + "$");
    }

    public String hash(String normalized) {
        byte[] salt = new byte[SALT_BYTES];
        random.nextBytes(salt);
        byte[] derived = derive(passwordInput(normalized, pepperKey), salt, iterations);
        Base64.Encoder b64 = Base64.getEncoder();
        String prefix = pepperKey != null ? PEPPERED_PREFIX : LEGACY_PREFIX;
        return prefix + "$" + iterations + "$" + b64.encodeToString(salt) + "$" + b64.encodeToString(derived);
    }

    /**
     * Compares against EVERY stored hash (no early exit) so timing does not reveal which entry matched.
     * Malformed entries never match and never throw. At most {@value #VERIFY_PERMITS} verifications run at once.
     */
    public boolean matchesAny(String normalized, List<String> storedHashes) {
        try {
            verifyPermits.acquire();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
        try {
            boolean matched = false;
            for (String stored : storedHashes) {
                matched |= matches(normalized, stored);
            }
            return matched;
        } finally {
            verifyPermits.release();
        }
    }

    boolean matches(String normalized, String stored) {
        try {
            String[] parts = stored.split("\\$", -1);
            if (parts.length != 4) {
                return false;
            }
            byte[] key;
            if (LEGACY_PREFIX.equals(parts[0])) {
                key = null;
            } else if (PEPPERED_PREFIX.equals(parts[0]) && pepperKey != null) {
                key = pepperKey;
            } else {
                return false;
            }
            int iters = Integer.parseInt(parts[1]);
            if (iters < 1 || iters > MAX_STORED_ITERATIONS) {
                return false;
            }
            byte[] salt = Base64.getDecoder().decode(parts[2]);
            byte[] expected = Base64.getDecoder().decode(parts[3]);
            return constantTimeEquals(derive(passwordInput(normalized, key), salt, iters), expected);
        } catch (RuntimeException e) {
            return false;
        }
    }

    public static boolean constantTimeEquals(byte[] a, byte[] b) {
        return MessageDigest.isEqual(a, b);
    }

    private static char[] passwordInput(String normalized, byte[] key) {
        if (key == null) {
            return normalized.toCharArray();
        }
        byte[] peppered = hmac(key, normalized.getBytes(StandardCharsets.UTF_8));
        return Base64.getEncoder().encodeToString(peppered).toCharArray();
    }

    private static byte[] hmac(byte[] key, byte[] data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(data);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HmacSHA256 unavailable", e);
        }
    }

    private static byte[] derive(char[] password, byte[] salt, int iters) {
        PBEKeySpec spec = new PBEKeySpec(password, salt, iters, HASH_BITS);
        try {
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("PBKDF2WithHmacSHA256 unavailable", e);
        } finally {
            spec.clearPassword();
        }
    }
}
