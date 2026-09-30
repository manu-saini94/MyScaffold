package com.ourstory.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Typed view of the "ourstory.*" properties; blank values mean "not configured". */
@ConfigurationProperties(prefix = "ourstory")
public record OurStoryProperties(String dataDir, Google google, String viewerCookieSecret, String adminEmail) {

    public record Google(String clientId, String clientSecret) {
    }
}
