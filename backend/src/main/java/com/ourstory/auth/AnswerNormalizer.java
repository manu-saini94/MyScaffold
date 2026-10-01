package com.ourstory.auth;

import java.text.Normalizer;
import java.util.Locale;
import java.util.Optional;

/** Canonical form of an unlock answer: NFKC, lower-case (ROOT), all whitespace removed, 1 to 100 chars. */
public final class AnswerNormalizer {

    public static final int MAX_LENGTH = 100;
    /** Shortest NORMALISED answer that may be stored (unlock attempts of any length 1 to 100 are still compared). */
    public static final int MIN_STORED_LENGTH = 4;

    private AnswerNormalizer() {
    }

    /** @return the canonical form, or empty when the input is null, blank or longer than 100 characters */
    public static Optional<String> normalize(String raw) {
        if (raw == null || raw.length() > MAX_LENGTH) {
            return Optional.empty();
        }
        String folded = Normalizer.normalize(raw, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT);
        StringBuilder out = new StringBuilder(folded.length());
        folded.codePoints()
                .filter(cp -> !Character.isWhitespace(cp) && !Character.isSpaceChar(cp))
                .forEach(out::appendCodePoint);
        if (out.isEmpty() || out.length() > MAX_LENGTH) {
            return Optional.empty();
        }
        return Optional.of(out.toString());
    }

    /** Like {@link #normalize} but also empty when fewer than {@value #MIN_STORED_LENGTH} characters remain. */
    public static Optional<String> normalizeForStorage(String raw) {
        return normalize(raw).filter(n -> n.codePointCount(0, n.length()) >= MIN_STORED_LENGTH);
    }
}
