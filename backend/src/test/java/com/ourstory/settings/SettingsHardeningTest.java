package com.ourstory.settings;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** Plain H2 (no Spring context): list parsing logs the key, hero pruning, question validation. */
class SettingsHardeningTest {

    private static final String A = "01HZX0000000000000000000AA";
    private static final String B = "01HZX0000000000000000000BB";

    private SettingsService service() {
        DriverManagerDataSource ds = new DriverManagerDataSource("jdbc:h2:mem:settings-hardening;DB_CLOSE_DELAY=-1",
                "sa", "");
        JdbcClient jdbc = JdbcClient.create(ds);
        jdbc.sql("DROP TABLE IF EXISTS settings").update();
        jdbc.sql("CREATE TABLE settings (\"key\" VARCHAR(64) PRIMARY KEY, \"value\" VARCHAR(10000) NOT NULL, "
                + "updated_at TIMESTAMP WITH TIME ZONE NOT NULL)").update();
        return new SettingsService(new SettingsRepository(jdbc), new ObjectMapper(),
                Clock.fixed(Instant.parse("2026-10-01T00:00:00Z"), ZoneOffset.UTC));
    }

    @Test
    void removeHeroMediaDropsOnlyThatIdAndReportsChange() {
        SettingsService settings = service();
        settings.applyUpdate(Map.of(SettingKeys.HERO_MEDIA_IDS, "[\"" + A + "\",\"" + B + "\"]"), null);
        assertThat(settings.removeHeroMedia(A)).isTrue();
        assertThat(settings.heroMediaIds()).containsExactly(B);
        assertThat(settings.removeHeroMedia(A)).isFalse();
        assertThat(settings.removeHeroMedia(B)).isTrue();
        assertThat(settings.heroMediaIds()).isEmpty();
    }

    @Test
    void anUnparseableStoredListIsLoggedWithItsKeyAndTreatedAsEmpty() {
        SettingsService settings = service();
        settings.applyUpdate(Map.of(SettingKeys.HERO_MEDIA_IDS, "not json"), null);
        Logger logger = (Logger) LoggerFactory.getLogger(SettingsService.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            assertThat(settings.heroMediaIds()).isEmpty();
            assertThat(appender.list).hasSize(1);
            assertThat(appender.list.get(0).getFormattedMessage()).contains(SettingKeys.HERO_MEDIA_IDS)
                    .doesNotContain("not json");
        } finally {
            logger.detachAppender(appender);
        }
    }

    @Test
    void theUnlockQuestionValidatorMatchesTheAdminRules() {
        assertThat(SettingsValidator.validQuestion("  Where did we meet?  ")).isEqualTo("Where did we meet?");
        for (String bad : List.of("", "   ", "a\u0007b", "q".repeat(301))) {
            assertThatThrownBy(() -> SettingsValidator.validQuestion(bad)).isInstanceOf(IllegalArgumentException.class);
        }
        assertThatThrownBy(() -> SettingsValidator.validQuestion(null)).isInstanceOf(IllegalArgumentException.class);
        assertThat(SettingsValidator.validQuestion("q".repeat(300))).hasSize(300);
    }
}
