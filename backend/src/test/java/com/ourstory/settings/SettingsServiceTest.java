package com.ourstory.settings;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;

/** Real H2 + Flyway: the V3 seed, typed getters, atomic updates and the epoch. */
@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:ourstory-settings-service;DB_CLOSE_DELAY=-1")
@ActiveProfiles("test")
class SettingsServiceTest {

    @Autowired SettingsService settings;
    @Autowired SettingsRepository repository;
    @Autowired JdbcClient jdbc;

    @Test
    void seedHasTheNonSecretDefaultsAndUtf8RoundTrips() {
        assertThat(settings.appTitle()).isEqualTo("Anvi ❤ Manu");
        assertThat(settings.appTitle().codePointAt(5)).isEqualTo(0x2764);
        assertThat(settings.tagline()).isEqualTo("Love you till eternity and back");
        assertThat(settings.defaultTheme()).isEqualTo("rose");
        assertThat(settings.specialDate()).isEqualTo(LocalDate.of(2027, 2, 14));
        assertThat(settings.herName()).isEqualTo("Anvi");
        assertThat(settings.myName()).isEqualTo("Manu");
        assertThat(settings.easterEggNicknames()).containsExactly("anvi");
        assertThat(settings.heroMediaIds()).isEmpty();
        assertThat(settings.viewerEpoch()).isPositive();
    }

    @Test
    void nothingSecretIsSeeded() {
        assertThat(repository.find(SettingKeys.UNLOCK_QUESTION)).isEmpty();
        assertThat(repository.find(SettingKeys.UNLOCK_ANSWER_HASHES)).isEmpty();
        assertThat(settings.publicView()).doesNotContainKeys("unlockQuestion", "unlock_question");
        assertThat(settings.publicView().toString()).doesNotContain("unlock");
    }

    @Test
    void applyUpdateWritesAtomicallyAndBumpsEpochOnlyForCredentials() {
        long before = settings.viewerEpoch();
        settings.applyUpdate(Map.of(SettingKeys.TAGLINE, "New ❤ tagline"), null);
        assertThat(settings.tagline()).isEqualTo("New ❤ tagline");
        assertThat(settings.viewerEpoch()).isEqualTo(before);

        settings.applyUpdate(Map.of(), List.of("h1", "h2"));
        assertThat(settings.unlockAnswerHashes()).containsExactly("h1", "h2");
        assertThat(settings.viewerEpoch()).isEqualTo(before + 1);

        settings.applyUpdate(Map.of(SettingKeys.UNLOCK_QUESTION, "Q?"), null);
        assertThat(settings.unlockQuestion()).contains("Q?");
        assertThat(settings.viewerEpoch()).isEqualTo(before + 2);
        assertThat(settings.unlockConfigured()).isTrue();

        assertThat(settings.bumpViewerEpoch()).isEqualTo(before + 3);
        jdbc.sql("DELETE FROM settings WHERE \"key\" IN ('unlock_question','unlock_answer_hashes')").update();
        assertThat(settings.unlockConfigured()).isFalse();
    }

    @Test
    void corruptStoredListsDegradeToEmpty() {
        repository.upsert(SettingKeys.HERO_MEDIA_IDS, "not json", java.time.OffsetDateTime.now());
        assertThat(settings.heroMediaIds()).isEmpty();
        repository.upsert(SettingKeys.HERO_MEDIA_IDS, "[]", java.time.OffsetDateTime.now());
    }

    @Test
    void missingRequiredSettingFailsLoudly() {
        jdbc.sql("DELETE FROM settings WHERE \"key\" = 'my_name'").update();
        try {
            org.assertj.core.api.Assertions.assertThatThrownBy(settings::myName)
                    .isInstanceOf(IllegalStateException.class);
        } finally {
            repository.upsert(SettingKeys.MY_NAME, "Manu", java.time.OffsetDateTime.now());
        }
    }
}
