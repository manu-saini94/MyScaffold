package com.ourstory.google;

import com.ourstory.auth.PickerTokenProvider;
import com.ourstory.common.ApiException;
import com.ourstory.google.PickerModels.PickerSession;
import java.math.BigDecimal;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;
import java.util.regex.Pattern;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

@Service
public class PickerSessionService {

    private static final Pattern SESSION_ID = Pattern.compile("^[A-Za-z0-9_-]{6,256}$");
    private static final long DEFAULT_POLL_MS = 5_000;

    private final PickerClient client;
    private final PickerTokenProvider tokens;

    public PickerSessionService(PickerClient client, PickerTokenProvider tokens) {
        this.client = client;
        this.tokens = tokens;
    }

    /** Normalised polling hint: durations in milliseconds (timeout null when Google sends none). */
    public record Polling(long pollIntervalMs, Long timeoutMs) {
    }

    public record CreatedSession(String sessionId, String pickerUri, Polling pollingConfig, String expireTime) {
    }

    public record SessionStatus(boolean mediaItemsSet, Polling pollingConfig, String expireTime) {
    }

    public static String requireValidId(String sessionId) {
        if (sessionId == null || !SESSION_ID.matcher(sessionId).matches()) {
            throw ApiException.badRequest("Invalid picker session id");
        }
        return sessionId;
    }

    public CreatedSession create(Authentication principal, Integer maxItemCount) {
        if (maxItemCount != null && (maxItemCount < 1 || maxItemCount > 2000)) {
            throw ApiException.badRequest("maxItemCount must be between 1 and 2000");
        }
        PickerSession session = client.createSession(tokens.accessToken(principal), maxItemCount);
        if (session == null || session.id() == null || session.pickerUri() == null) {
            throw new GoogleApiException(0);
        }
        return new CreatedSession(session.id(), autoclose(requireGooglePickerUri(session.pickerUri())),
                polling(session), session.expireTime());
    }

    /** The admin's browser is sent to this URI, so it must be https on google.com (or a subdomain). */
    static String requireGooglePickerUri(String pickerUri) {
        URI uri;
        try {
            uri = new URI(pickerUri);
        } catch (URISyntaxException e) {
            throw new GoogleApiException("Google returned an unexpected picker address.");
        }
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        boolean trusted = "https".equalsIgnoreCase(uri.getScheme())
                && (host.equals("google.com") || host.endsWith(".google.com"));
        if (!trusted) {
            throw new GoogleApiException("Google returned an unexpected picker address.");
        }
        return pickerUri;
    }

    public SessionStatus status(Authentication principal, String sessionId) {
        requireValidId(sessionId);
        PickerSession session = client.getSession(tokens.accessToken(principal), sessionId);
        if (session == null) {
            throw new GoogleApiException(0);
        }
        return new SessionStatus(session.mediaItemsSet(), polling(session), session.expireTime());
    }

    /** Web flow: the Picker tab closes itself when the user is done. */
    static String autoclose(String pickerUri) {
        return pickerUri.endsWith("/autoclose") ? pickerUri : pickerUri.replaceAll("/+$", "") + "/autoclose";
    }

    /** pollingConfig is only sent while mediaItemsSet is false; null when absent. */
    private static Polling polling(PickerSession session) {
        if (session.pollingConfig() == null) {
            return null;
        }
        Long interval = parseMillis(session.pollingConfig().pollInterval());
        Long timeout = parseMillis(session.pollingConfig().timeoutIn());
        return new Polling(interval == null || interval <= 0 ? DEFAULT_POLL_MS : interval, timeout);
    }

    /** Parses Google Duration strings like "5s" or "0.5s"; null when absent or malformed. */
    static Long parseMillis(String duration) {
        if (duration == null || !duration.endsWith("s")) {
            return null;
        }
        try {
            return new BigDecimal(duration.substring(0, duration.length() - 1))
                    .multiply(BigDecimal.valueOf(1000)).longValue();
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
