package com.ourstory.content;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ourstory.common.UlidGenerator;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

/** The V4 migration: schema constraints and the six seeded worlds. */
class ContentSchemaTest extends ContentTestBase {

    @Test
    void seedsExactlySixWorldsInOrderWithLayouts() {
        List<World> all = worlds.findAll();
        assertThat(all).extracting(World::slug).containsExactly("where-it-all-began", "our-firsts",
                "adventures-together", "little-everyday-moments", "the-question", "our-forever");
        assertThat(all).extracting(World::layout).containsExactly(WorldLayout.POLAROID_TABLE,
                WorldLayout.FILM_STRIP, WorldLayout.POSTCARDS, WorldLayout.MEMORY_WALL, WorldLayout.ENVELOPE,
                WorldLayout.CONSTELLATION);
        assertThat(all).extracting(World::sortOrder).containsExactly(1, 2, 3, 4, 5, 6);
        assertThat(all).extracting(World::id).containsExactlyInAnyOrderElementsOf(SEED_IDS)
                .allMatch(UlidGenerator::isValid);
        assertThat(all).allSatisfy(w -> {
            assertThat(w.published()).isTrue();
            assertThat(w.themeAccent()).matches("^#[0-9a-f]{6}$");
            assertThat(w.introText()).isNotBlank();
            assertThat(w.outroText()).isNotBlank();
            assertThat(w.subtitle()).isNotBlank();
            assertThat(w.tagline()).isNotBlank();
        });
        assertThat(all).extracting(World::themeAccent).doesNotHaveDuplicates();
        assertThat(moments.countsByWorld()).isEmpty();
    }

    @Test
    void onlyOurForeverIsTimeLockedAndTheInstantIsExact() {
        assertThat(worlds.findAll()).filteredOn(w -> w.unlockAt() != null).extracting(World::slug)
                .containsExactly("our-forever");
        World forever = worlds.findBySlug("our-forever").orElseThrow();
        assertThat(forever.unlockAt()).isEqualTo(Instant.parse("2027-02-13T18:30:00Z"));
    }

    @Test
    void nonAsciiSeedTextSurvivesTheRoundTrip() {
        World world = worlds.findBySlug("little-everyday-moments").orElseThrow();
        assertThat(world.introText()).contains("—").doesNotContain("â").doesNotContain("?");
    }

    @Test
    void nonAsciiTextWrittenByTheAppSurvivesTheRoundTrip() {
        String text = "Café — नमस्ते ❤";
        World w = newWorld("utf-test", 50);
        worlds.update(new World(w.id(), w.slug(), text, text, text, w.layout(), null, null, 50, null, text, text,
                null, true, w.createdAt(), Instant.now()));
        assertThat(worlds.findById(w.id()).orElseThrow().title()).isEqualTo(text);
    }

    @Test
    void databaseRejectsBadSlugLayoutAccentAndHttpMusic() {
        assertThatThrownBy(() -> worlds.insert(withSlug("Bad Slug"))).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> worlds.insert(withSlug("our-forever"))).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.sql("UPDATE world SET layout = 'NOPE' WHERE slug = 'our-firsts'").update())
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.sql("UPDATE world SET theme_accent = 'red' WHERE slug = 'our-firsts'").update())
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.sql("UPDATE world SET music_url = 'http://x.test/a.mp3' WHERE slug = 'our-firsts'")
                .update()).isInstanceOf(DataIntegrityViolationException.class);
    }

    private World withSlug(String slug) {
        return new World(ulids.next(), slug, "T", null, null, WorldLayout.FILM_STRIP, null, null, 90, null, null,
                null, null, true, Instant.now(), Instant.now());
    }
}
