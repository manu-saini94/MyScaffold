package com.ourstory.auth;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;

class ViewerCookieCodecTest {

    private static final String SECRET = "0123456789012345678901234567890123456789";
    private static final Instant START = Instant.parse("2026-10-01T00:00:00Z");

    private final MutableClock clock = new MutableClock(START);
    private final ViewerCookieCodec codec = codec(SECRET);

    private ViewerCookieCodec codec(String secret) {
        ViewerProperties props = new ViewerProperties(null, List.of(), false, Duration.ofDays(30), 1000,
                Duration.ofSeconds(5), 5, 60, Duration.ofMinutes(10));
        return new ViewerCookieCodec(secret, props, new ObjectMapper(), clock);
    }

    private static String sign(String json, String secret) throws Exception {
        byte[] payload = json.getBytes(StandardCharsets.UTF_8);
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        Base64.Encoder b64 = Base64.getUrlEncoder().withoutPadding();
        return b64.encodeToString(payload) + "." + b64.encodeToString(mac.doFinal(payload));
    }

    @Test
    void roundTripsAndUsesTheDocumentedPayload() {
        String token = codec.issue(7);
        String json = new String(Base64.getUrlDecoder().decode(token.split("\\.")[0]), StandardCharsets.UTF_8);
        long now = START.getEpochSecond();
        assertThat(json).isEqualTo("{\"v\":1,\"iat\":" + now + ",\"exp\":" + (now + 30 * 86400) + ",\"ep\":7}");
        var claims = codec.verify(token).orElseThrow();
        assertThat(claims.epoch()).isEqualTo(7);
        assertThat(claims.expiresAt() - claims.issuedAt()).isEqualTo(30 * 86400);
    }

    @Test
    void flippingABitInThePayloadOrTheMacIsRejected() {
        String token = codec.issue(1);
        String[] parts = token.split("\\.");
        for (int part = 0; part < 2; part++) {
            byte[] bytes = Base64.getUrlDecoder().decode(parts[part]);
            bytes[bytes.length / 2] ^= 1;
            String[] tampered = parts.clone();
            tampered[part] = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
            assertThat(codec.verify(tampered[0] + "." + tampered[1])).as("part " + part).isEmpty();
        }
    }

    @Test
    void malformedInputIsRejectedWithoutExceptions() {
        String good = codec.issue(1);
        for (String bad : new String[] {null, "", ".", "a.", ".b", "abc", good.substring(0, good.length() - 5),
                good + ".more", "!!!.???", "a".repeat(100_000), good.replace('.', ','), "e30.e30"}) {
            assertThat(codec.verify(bad)).as(String.valueOf(bad).length() + " chars").isEmpty();
        }
    }

    @Test
    void rejectsWrongVersionBadShapeExpiredAndFutureIssued() throws Exception {
        long now = START.getEpochSecond();
        String ok = "{\"v\":1,\"iat\":" + now + ",\"exp\":" + (now + 100) + ",\"ep\":1}";
        assertThat(codec.verify(sign(ok, SECRET))).isPresent();
        assertThat(codec.verify(sign(ok.replace("\"v\":1", "\"v\":2"), SECRET))).as("version").isEmpty();
        assertThat(codec.verify(sign("{\"v\":1,\"iat\":" + now + ",\"exp\":" + (now - 1) + ",\"ep\":1}", SECRET)))
                .as("expired").isEmpty();
        assertThat(codec.verify(sign("{\"v\":1,\"iat\":" + (now + 3600) + ",\"exp\":" + (now + 9000)
                + ",\"ep\":1}", SECRET))).as("future iat").isEmpty();
        assertThat(codec.verify(sign("{\"v\":1,\"iat\":" + (now + 30) + ",\"exp\":" + (now + 9000) + ",\"ep\":1}",
                SECRET))).as("small skew is fine").isPresent();
        assertThat(codec.verify(sign("{\"v\":1,\"iat\":1,\"exp\":" + (now + 9) + "}", SECRET))).as("no ep").isEmpty();
        assertThat(codec.verify(sign("{\"v\":1,\"iat\":\"x\",\"exp\":" + (now + 9) + ",\"ep\":1}", SECRET)))
                .as("iat type").isEmpty();
        assertThat(codec.verify(sign("[1,2]", SECRET))).as("not an object").isEmpty();
        assertThat(codec.verify(sign("not json", SECRET))).as("not json").isEmpty();
        assertThat(codec.verify(sign(ok, "another-secret-another-secret-another"))).as("wrong key").isEmpty();
    }

    @Test
    void cookiesExpireWithTheClock() {
        String token = codec.issue(1);
        clock.advance(Duration.ofDays(30).minusSeconds(1));
        assertThat(codec.verify(token)).isPresent();
        clock.advance(Duration.ofSeconds(1));
        assertThat(codec.verify(token)).isEmpty();
    }

    @Test
    void blankSecretUsesAnEphemeralKeyThatDiffersPerInstance() {
        ViewerCookieCodec a = codec("");
        ViewerCookieCodec b = codec(null);
        String token = a.issue(1);
        assertThat(a.verify(token)).isPresent();
        assertThat(b.verify(token)).isEmpty();
        assertThat(codec.verify(token)).isEmpty();
    }
}
