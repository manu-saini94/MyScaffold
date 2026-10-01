package com.ourstory.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ourstory.config.OurStoryProperties;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.Base64;
import java.util.Optional;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Signs and verifies the viewer cookie value: {@code base64url(payload JSON) "." base64url(HMAC-SHA256)}.
 * The payload is {@code {"v":1,"iat":..,"exp":..,"ep":..}}. {@link #verify} checks signature, version and
 * time window only; the epoch is compared by the caller against the current settings value.
 * Verification never throws: any malformed input is simply "not valid".
 */
@Component
public class ViewerCookieCodec {

    public static final int VERSION = 1;
    static final long SKEW_SECONDS = 60;
    static final int MAX_LENGTH = 512;
    private static final Logger log = LoggerFactory.getLogger(ViewerCookieCodec.class);

    /** Verified cookie contents. */
    public record Claims(long issuedAt, long expiresAt, long epoch) {
    }

    private final byte[] key;
    private final Clock clock;
    private final ViewerProperties props;
    private final ObjectMapper mapper;

    @Autowired
    public ViewerCookieCodec(OurStoryProperties app, ViewerProperties props, ObjectMapper mapper,
            ObjectProvider<Clock> clock) {
        this(app.viewerCookieSecret(), props, mapper, clock.getIfAvailable(Clock::systemUTC));
    }

    ViewerCookieCodec(String secret, ViewerProperties props, ObjectMapper mapper, Clock clock) {
        this.props = props;
        this.mapper = mapper;
        this.clock = clock;
        if (secret == null || secret.isBlank()) {
            byte[] random = new byte[32];
            new SecureRandom().nextBytes(random);
            this.key = random;
            log.warn("VIEWER_COOKIE_SECRET is blank: using an EPHEMERAL signing key. Viewer cookies stop "
                    + "working on every restart (acceptable for local development only).");
        } else {
            this.key = secret.getBytes(StandardCharsets.UTF_8);
        }
    }

    public String issue(long epoch) {
        long now = clock.instant().getEpochSecond();
        long exp = now + props.cookieTtl().toSeconds();
        String json = "{\"v\":" + VERSION + ",\"iat\":" + now + ",\"exp\":" + exp + ",\"ep\":" + epoch + "}";
        byte[] payload = json.getBytes(StandardCharsets.UTF_8);
        Base64.Encoder b64 = Base64.getUrlEncoder().withoutPadding();
        return b64.encodeToString(payload) + "." + b64.encodeToString(mac(payload));
    }

    public Optional<Claims> verify(String token) {
        try {
            return doVerify(token);
        } catch (RuntimeException e) {
            return Optional.empty();
        }
    }

    private Optional<Claims> doVerify(String token) {
        if (token == null || token.isEmpty() || token.length() > MAX_LENGTH) {
            return Optional.empty();
        }
        int dot = token.indexOf('.');
        if (dot <= 0 || dot != token.lastIndexOf('.') || dot == token.length() - 1) {
            return Optional.empty();
        }
        Base64.Decoder b64 = Base64.getUrlDecoder();
        byte[] payload = b64.decode(token.substring(0, dot));
        byte[] signature = b64.decode(token.substring(dot + 1));
        if (!MessageDigest.isEqual(mac(payload), signature)) {
            return Optional.empty();
        }
        return parse(payload);
    }

    private Optional<Claims> parse(byte[] payload) {
        JsonNode node;
        try {
            node = mapper.readTree(payload);
        } catch (java.io.IOException e) {
            return Optional.empty();
        }
        if (node == null || !node.isObject() || !isLong(node, "v") || !isLong(node, "iat")
                || !isLong(node, "exp") || !isLong(node, "ep") || node.get("v").asLong() != VERSION) {
            return Optional.empty();
        }
        long now = clock.instant().getEpochSecond();
        long iat = node.get("iat").asLong();
        long exp = node.get("exp").asLong();
        if (exp <= now || iat > now + SKEW_SECONDS) {
            return Optional.empty();
        }
        return Optional.of(new Claims(iat, exp, node.get("ep").asLong()));
    }

    private static boolean isLong(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value != null && value.isIntegralNumber() && value.canConvertToLong();
    }

    private byte[] mac(byte[] payload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(payload);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HmacSHA256 unavailable", e);
        }
    }
}
