package com.ourstory.auth;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * Prod profile where the TCP peer (this test, on loopback) is NOT a trusted proxy: a forged X-Forwarded-For must
 * be ignored, so many different forged values from one peer all land in ONE rate-limit bucket.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:h2:mem:ourstory-fwd-untrusted;DB_CLOSE_DELAY=-1",
        "ourstory.viewer.pbkdf2-iterations=600000",
        "ourstory.viewer.unlock-question=Test question?",
        "ourstory.viewer.unlock-answers=Sample",
        "ourstory.viewer-cookie-secret=" + ForwardedHeaderTestBase.SECRET,
        "OURSTORY_TRUSTED_PROXIES=10.9.9.9"})
@ActiveProfiles({"test", "prod"})
class ForwardedHeaderUntrustedPeerTest extends ForwardedHeaderTestBase {

    @Test
    void forgedForwardedForValuesFromAnUntrustedPeerShareOneBucket() throws Exception {
        for (int i = 0; i < 5; i++) {
            assertThat(wrongAttempt("203.0.113." + i)).as("attempt " + i).isEqualTo(401);
        }
        assertThat(wrongAttempt("198.51.100.77")).isEqualTo(429);
        assertThat(wrongAttempt(null)).isEqualTo(429);
    }
}
