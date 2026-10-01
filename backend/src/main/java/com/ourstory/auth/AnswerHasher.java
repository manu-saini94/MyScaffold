package com.ourstory.auth;

import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.List;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import org.springframework.stereotype.Component;

/**
 * PBKDF2WithHmacSHA256 hashing of NORMALISED answers. Stored form:
 * {@code pbkdf2-sha256$iterations$saltBase64$hashBase64} with a random 16-byte salt per answer.
 */
@Component
public class AnswerHasher {

    static final String PREFIX = "pbkdf2-sha256";
    static final int SALT_BYTES = 16;
    static final int HASH_BITS = 256;
    /** Upper bound on iterations read from a stored string (a corrupted row must not burn the CPU). */
    static final int MAX_STORED_ITERATIONS = 5_000_000;

    private final SecureRandom random = new SecureRandom();
    private final int iterations;

    public AnswerHasher(ViewerProperties props) {
        this.iterations = props.pbkdf2Iterations();
    }

    public String hash(String normalized) {
        byte[] salt = new byte[SALT_BYTES];
        random.nextBytes(salt);
        byte[] derived = derive(normalized, salt, iterations);
        Base64.Encoder b64 = Base64.getEncoder();
        return PREFIX + "$" + iterations + "$" + b64.encodeToString(salt) + "$" + b64.encodeToString(derived);
    }

    /**
     * Compares against EVERY stored hash (no early exit) so timing does not reveal which entry matched.
     * Malformed entries never match and never throw.
     */
    public boolean matchesAny(String normalized, List<String> storedHashes) {
        boolean matched = false;
        for (String stored : storedHashes) {
            matched |= matches(normalized, stored);
        }
        return matched;
    }

    boolean matches(String normalized, String stored) {
        try {
            String[] parts = stored.split("\\$", -1);
            if (parts.length != 4 || !PREFIX.equals(parts[0])) {
                return false;
            }
            int iters = Integer.parseInt(parts[1]);
            if (iters < 1 || iters > MAX_STORED_ITERATIONS) {
                return false;
            }
            byte[] salt = Base64.getDecoder().decode(parts[2]);
            byte[] expected = Base64.getDecoder().decode(parts[3]);
            return constantTimeEquals(derive(normalized, salt, iters), expected);
        } catch (RuntimeException e) {
            return false;
        }
    }

    public static boolean constantTimeEquals(byte[] a, byte[] b) {
        return MessageDigest.isEqual(a, b);
    }

    private static byte[] derive(String normalized, byte[] salt, int iters) {
        PBEKeySpec spec = new PBEKeySpec(normalized.toCharArray(), salt, iters, HASH_BITS);
        try {
            return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("PBKDF2WithHmacSHA256 unavailable", e);
        } finally {
            spec.clearPassword();
        }
    }
}
