package com.ourstory.common;

import java.math.BigInteger;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Small ULID generator (26 chars, Crockford base32). Monotonic: ids created within the same millisecond
 * increase strictly, so lexical order equals creation order.
 */
@Component
public class UlidGenerator {

    private static final String ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    private static final Pattern FORMAT = Pattern.compile("^[0-7][0-9A-HJKMNP-TV-Z]{25}$");
    private static final BigInteger RANDOM_MODULUS = BigInteger.ONE.shiftLeft(80);
    private static final long MAX_TIME = (1L << 48) - 1;

    private final Clock clock;
    private final SecureRandom random;
    private long lastTime = -1;
    private BigInteger lastRandom = BigInteger.ZERO;

    @Autowired
    public UlidGenerator() {
        this(Clock.systemUTC(), new SecureRandom());
    }

    public UlidGenerator(Clock clock, SecureRandom random) {
        this.clock = clock;
        this.random = random;
    }

    public static boolean isValid(String value) {
        return value != null && FORMAT.matcher(value).matches();
    }

    /** Milliseconds since epoch encoded in a valid ULID. */
    public static long timestampOf(String ulid) {
        if (!isValid(ulid)) {
            throw new IllegalArgumentException("not a ULID");
        }
        long time = 0;
        for (int i = 0; i < 10; i++) {
            time = (time << 5) | ALPHABET.indexOf(ulid.charAt(i));
        }
        return time;
    }

    public synchronized String next() {
        long now = Math.max(clock.millis(), lastTime);
        if (now == lastTime) {
            lastRandom = lastRandom.add(BigInteger.ONE);
            if (lastRandom.compareTo(RANDOM_MODULUS) >= 0) {
                now++; // 2^80 ids in one millisecond is practically impossible, but stay correct.
                lastRandom = newRandom();
            }
        } else {
            lastRandom = newRandom();
        }
        if (now > MAX_TIME) {
            throw new IllegalStateException("ULID timestamp overflow");
        }
        lastTime = now;
        return encode(BigInteger.valueOf(now).shiftLeft(80).or(lastRandom));
    }

    private BigInteger newRandom() {
        // 79 random bits: leaves headroom so increments inside one millisecond never overflow in practice.
        return new BigInteger(79, random);
    }

    private static String encode(BigInteger value) {
        char[] out = new char[26];
        BigInteger v = value;
        for (int i = 25; i >= 0; i--) {
            out[i] = ALPHABET.charAt(v.and(BigInteger.valueOf(31)).intValue());
            v = v.shiftRight(5);
        }
        return new String(out);
    }
}
