package com.ourstory.auth;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * Prod profile with the DEFAULT trusted proxy (loopback only) and a proxy on loopback: the forwarded client
 * address is used, so different clients get different buckets while one client keeps hitting its own.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.datasource.url=jdbc:h2:mem:ourstory-fwd-trusted;DB_CLOSE_DELAY=-1",
        "ourstory.viewer.pbkdf2-iterations=600000",
        "ourstory.viewer.unlock-question=Test question?",
        "ourstory.viewer.unlock-answers=Sample",
        "ourstory.viewer-cookie-secret=" + ForwardedHeaderTestBase.SECRET})
@ActiveProfiles({"test", "prod"})
class ForwardedHeaderTrustedProxyTest extends ForwardedHeaderTestBase {

    @Test
    void theForwardedClientIsUsedWhenThePeerIsTheTrustedLoopbackProxy() throws Exception {
        for (int i = 0; i < 5; i++) {
            assertThat(wrongAttempt("203.0.113.9")).isEqualTo(401);
        }
        assertThat(wrongAttempt("203.0.113.9")).isEqualTo(429);
        // A different real client behind the same proxy is unaffected.
        assertThat(wrongAttempt("203.0.113.10")).isEqualTo(401);
        // A client-supplied prefix cannot help: the proxy-appended (right-most untrusted) address wins.
        assertThat(wrongAttempt("198.51.100.1, 203.0.113.9")).isEqualTo(429);
    }
}
