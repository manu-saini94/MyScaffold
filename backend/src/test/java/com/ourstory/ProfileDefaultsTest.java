package com.ourstory;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Properties;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.core.io.ClassPathResource;

/**
 * The shipped YAML files themselves (without the test profile mixed in): secure by default, dev relaxes only
 * the cookie's secure flag and turns dev tools on, prod trusts the proxy and keeps dev tools off.
 */
class ProfileDefaultsTest {

    private static Properties load(String file) {
        YamlPropertiesFactoryBean yaml = new YamlPropertiesFactoryBean();
        yaml.setResources(new ClassPathResource(file));
        Properties properties = yaml.getObject();
        assertThat(properties).isNotNull();
        return properties;
    }

    @Test
    void baseIsSecureByDefault() {
        Properties base = load("application.yml");
        assertThat(base.getProperty("server.servlet.session.cookie.secure")).isEqualTo("true");
        assertThat(base.getProperty("server.servlet.session.cookie.http-only")).isEqualTo("true");
        assertThat(base.getProperty("server.servlet.session.cookie.same-site")).isEqualTo("lax");
        assertThat(base.getProperty("server.servlet.session.timeout")).isEqualTo("30m");
        assertThat(base.getProperty("ourstory.post-login-url")).startsWith("/admin");
        assertThat(base.getProperty("server.forward-headers-strategy")).isNull();
    }

    @Test
    void devRelaxesOnlyTheSecureFlag() {
        Properties dev = load("application-dev.yml");
        assertThat(dev.getProperty("server.servlet.session.cookie.secure")).isEqualTo("false");
        assertThat(dev.getProperty("server.servlet.session.cookie.http-only")).isNull();
    }

    @Test
    void prodTrustsTheProxyKeepsCookiesSecure() {
        Properties prod = load("application-prod.yml");
        // Tomcat RemoteIpValve, fed by properties: the header is trusted only from the configured proxies.
        assertThat(prod.getProperty("server.forward-headers-strategy")).isEqualTo("native");
        assertThat(prod.getProperty("server.tomcat.remoteip.remote-ip-header")).isEqualTo("X-Forwarded-For");
        assertThat(prod.getProperty("server.tomcat.remoteip.internal-proxies"))
                .startsWith("${OURSTORY_TRUSTED_PROXIES:").doesNotContain("192").doesNotContain("10\\.\\d");
        assertThat(prod.getProperty("server.servlet.session.cookie.secure")).isNull(); // inherits true
    }
}
