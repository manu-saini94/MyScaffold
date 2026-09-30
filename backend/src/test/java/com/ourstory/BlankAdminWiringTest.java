package com.ourstory;

import static org.assertj.core.api.Assertions.assertThat;

import com.ourstory.config.StartupConfigValidator;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * ADMIN_EMAIL blank with a Google client. The startup validator would refuse this in real life, so it is
 * replaced by a mock here purely to prove that the filter chain itself also fails closed.
 */
@SpringBootTest(properties = {
        "ourstory.google.client-id=fake-client-id",
        "ourstory.google.client-secret=fake-secret",
        "ourstory.admin-email=",
        "spring.datasource.url=jdbc:h2:mem:ourstory-blank-admin-test;DB_CLOSE_DELAY=-1"})
@ActiveProfiles("test")
class BlankAdminWiringTest {

    @Autowired ApplicationContext context;
    @MockitoBean StartupConfigValidator validator;

    @Test
    void nobodyGetsTheAdminRoleWhenAdminEmailIsBlank() {
        var mapper = WiredMapper.from(context);
        for (String email : new String[] {"", " ", "owner@example.com", "anyone@example.com"}) {
            List<String> roles = mapper.mapAuthorities(List.of(WiredMapper.oidc(email, true))).stream()
                    .map(GrantedAuthority::getAuthority).toList();
            assertThat(roles).as(email).doesNotContain("ROLE_ADMIN");
        }
    }
}
