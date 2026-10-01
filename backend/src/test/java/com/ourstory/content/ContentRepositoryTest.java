package com.ourstory.content;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;

class ContentRepositoryTest extends ContentTestBase {

    // --- worlds -------------------------------------------------------------------------------------

    @Test
    void worldInsertFindUpdateRoundTrip() {
        String cover = seedMedia();
        World w = newWorld("round-trip", 20);
        World updated = new World(w.id(), "round-trip-2", "New", null, null, WorldLayout.ENVELOPE, cover, "#112233",
                20, Instant.parse("2030-01-01T00:00:00Z"), "i", "o", "https://m.test/a.mp3", false, w.createdAt(),
                Instant.now());
        assertThat(worlds.update(updated)).isTrue();
        World read = worlds.findById(w.id()).orElseThrow();
        assertThat(read).usingRecursiveComparison().ignoringFields("updatedAt", "createdAt").isEqualTo(updated);
        assertThat(worlds.findBySlug("round-trip-2")).isPresent();
        assertThat(worlds.findBySlug("round-trip")).isEmpty();
        assertThat(worlds.update(new World(ulids.next(), "zzz", "t", null, null, WorldLayout.FILM_STRIP, null, null,
                1, null, null, null, null, true, Instant.now(), Instant.now()))).isFalse();
    }

    @Test
    void findPublishedSkipsUnpublishedAndKeepsOrder() {
        World hidden = newWorld("hidden", 0);
        jdbc.sql("UPDATE world SET published = FALSE WHERE id = :id").param("id", hidden.id()).update();
        assertThat(worlds.findPublished()).extracting(World::slug).doesNotContain("hidden");
        assertThat(worlds.findAll()).extracting(World::slug).startsWith("hidden", "where-it-all-began");
        assertThat(worlds.findPublished()).hasSize(6);
    }

    @Test
    void nextSortOrderIsAfterTheLast() {
        assertThat(worlds.nextSortOrder()).isEqualTo(7);
        newWorld("late", 40);
        assertThat(worlds.nextSortOrder()).isEqualTo(41);
    }

    @Test
    void reorderRewritesSortOrderFromTheList() {
        List<String> ids = worlds.findAll().stream().map(World::id).toList();
        List<String> reversed = ids.reversed();
        worlds.reorder(reversed);
        assertThat(worlds.findAll()).extracting(World::id).containsExactlyElementsOf(reversed);
        assertThat(worlds.findAll()).extracting(World::sortOrder).containsExactly(1, 2, 3, 4, 5, 6);
        worlds.reorder(ids);
        assertThat(worlds.findAll()).extracting(World::id).containsExactlyElementsOf(ids);
    }

    @Test
    void existsByIdAndDelete() {
        World w = newWorld("gone", 30);
        assertThat(worlds.existsById(w.id())).isTrue();
        assertThat(worlds.delete(w.id())).isTrue();
        assertThat(worlds.existsById(w.id())).isFalse();
        assertThat(worlds.delete(w.id())).isFalse();
    }

    // --- moments -------------------------------------------------------------------------------------

    @Test
    void listByWorldJoinsMediaAndKeepsDisplayOrder() {
        World w = newWorld("ordered", 20);
        String a = seedMedia();
        String b = seedMedia();
        String c = seedMedia();
        Moment second = new Moment(ulids.next(), w.id(), b, "cap", "back", LocalDate.of(2024, 5, 6), "Goa", 99, true);
        moments.replaceAll(w.id(), List.of(moment(w.id(), c, "first"), second, moment(w.id(), a, "third")));

        List<MomentWithMedia> list = moments.listByWorld(w.id());
        assertThat(list).extracting(MomentWithMedia::mediaId).containsExactly(c, b, a);
        assertThat(list).extracting(MomentWithMedia::sortOrder).containsExactly(1, 2, 3);
        MomentWithMedia m = list.get(1);
        assertThat(m.caption()).isEqualTo("cap");
        assertThat(m.note()).isEqualTo("back");
        assertThat(m.happenedOn()).isEqualTo(LocalDate.of(2024, 5, 6));
        assertThat(m.place()).isEqualTo("Goa");
        assertThat(m.favourite()).isTrue();
        assertThat(m.width()).isEqualTo(400);
        assertThat(m.height()).isEqualTo(300);
        assertThat(m.lqip()).startsWith("data:image/jpeg");
        assertThat(m.dominantColor()).isEqualTo("#112233");
        assertThat(m.mimeType()).isEqualTo("image/jpeg");
        assertThat(list.get(0).happenedOn()).isNull();
        assertThat(list.get(0).takenAt()).isNull();
    }

    @Test
    void replaceAllReplacesRatherThanAppends() {
        World w = newWorld("replace", 20);
        String a = seedMedia();
        String b = seedMedia();
        moments.replaceAll(w.id(), List.of(moment(w.id(), a, "x")));
        moments.replaceAll(w.id(), List.of(moment(w.id(), b, "y")));
        assertThat(moments.listByWorld(w.id())).extracting(MomentWithMedia::mediaId).containsExactly(b);
        moments.replaceAll(w.id(), List.of());
        assertThat(moments.listByWorld(w.id())).isEmpty();
    }

    @Test
    void replaceAllIsAtomicWhenAnInsertFailsMidway() {
        World w = newWorld("atomic", 20);
        String a = seedMedia();
        String b = seedMedia();
        String c = seedMedia();
        moments.replaceAll(w.id(), List.of(moment(w.id(), a, "keep-1"), moment(w.id(), b, "keep-2")));

        List<Moment> poisoned = List.of(moment(w.id(), c, "new-1"), moment(w.id(), a, "new-2"),
                moment(w.id(), b, "x".repeat(501)));
        assertThatThrownBy(() -> moments.replaceAll(w.id(), poisoned)).isInstanceOf(DataAccessException.class);

        assertThat(moments.listByWorld(w.id())).extracting(MomentWithMedia::caption)
                .containsExactly("keep-1", "keep-2");
    }

    @Test
    void sameMediaTwiceInOneWorldIsRejectedButAllowedAcrossWorlds() {
        World w1 = newWorld("dup-1", 20);
        World w2 = newWorld("dup-2", 21);
        String a = seedMedia();
        assertThatThrownBy(() -> moments.replaceAll(w1.id(), List.of(moment(w1.id(), a, "1"), moment(w1.id(), a, "2"))))
                .isInstanceOf(DataAccessException.class);
        moments.replaceAll(w1.id(), List.of(moment(w1.id(), a, "1")));
        moments.replaceAll(w2.id(), List.of(moment(w2.id(), a, "1")));
        assertThat(moments.countsByWorld()).containsEntry(w1.id(), 1).containsEntry(w2.id(), 1);
    }

    @Test
    void countsAndFirstMediaIdsComeFromGroupedQueries() {
        World w1 = newWorld("grp-1", 20);
        World w2 = newWorld("grp-2", 21);
        World empty = newWorld("grp-empty", 22);
        List<String> m = List.of(seedMedia(), seedMedia(), seedMedia(), seedMedia());
        moments.replaceAll(w1.id(), List.of(moment(w1.id(), m.get(2), ""), moment(w1.id(), m.get(0), ""),
                moment(w1.id(), m.get(1), "")));
        moments.replaceAll(w2.id(), List.of(moment(w2.id(), m.get(3), "")));

        assertThat(moments.countsByWorld()).containsOnly(Map.entry(w1.id(), 3), Map.entry(w2.id(), 1));
        Map<String, List<String>> first = moments.firstMediaIdsByWorld(2);
        assertThat(first.get(w1.id())).containsExactly(m.get(2), m.get(0));
        assertThat(first.get(w2.id())).containsExactly(m.get(3));
        assertThat(first).doesNotContainKey(empty.id());
        assertThat(moments.firstMediaIdsByWorld(10).get(w1.id())).containsExactly(m.get(2), m.get(0), m.get(1));
    }

    @Test
    void existingMediaIdsReturnsOnlyTheKnownOnes() {
        String a = seedMedia();
        String unknown = ulids.next();
        assertThat(moments.existingMediaIds(List.of(a, unknown))).containsExactly(a);
        assertThat(moments.existingMediaIds(List.of())).isEmpty();
    }

    // --- cascades ------------------------------------------------------------------------------------

    @Test
    void deletingMediaRemovesItsMomentsAndClearsCovers() {
        World w = newWorld("cascade-media", 20);
        String photo = seedMedia();
        String keep = seedMedia();
        moments.replaceAll(w.id(), List.of(moment(w.id(), photo, "a"), moment(w.id(), keep, "b")));
        jdbc.sql("UPDATE world SET cover_media_id = :m WHERE id = :id").param("m", photo).param("id", w.id()).update();

        media.deleteById(photo);

        assertThat(moments.listByWorld(w.id())).extracting(MomentWithMedia::mediaId).containsExactly(keep);
        assertThat(worlds.findById(w.id()).orElseThrow().coverMediaId()).isNull();
    }

    @Test
    void deletingAWorldRemovesItsMomentsAndOrphansItsLettersOnly() {
        World w = newWorld("cascade-world", 20);
        World other = newWorld("cascade-other", 21);
        String photo = seedMedia();
        moments.replaceAll(w.id(), List.of(moment(w.id(), photo, "a")));
        moments.replaceAll(other.id(), List.of(moment(other.id(), photo, "b")));
        letters.insert(new Letter(ulids.next(), w.id(), "t", "b", RevealTrigger.WORLD_OUTRO, 1, Instant.now()));
        letters.insert(new Letter(ulids.next(), other.id(), "t", "b", RevealTrigger.WORLD_OUTRO, 2, Instant.now()));
        letters.insert(new Letter(ulids.next(), null, "t", "b", RevealTrigger.SEALED_ICON, 3, Instant.now()));

        worlds.delete(w.id());

        assertThat(jdbc.sql("SELECT COUNT(*) FROM moment WHERE world_id = :w").param("w", w.id())
                .query(Long.class).single()).isZero();
        assertThat(letters.findByWorld(w.id())).isEmpty();
        assertThat(letters.findByWorld(other.id())).hasSize(1);
        assertThat(moments.listByWorld(other.id())).hasSize(1);
        // The deleted world's letter survives with no world (V5: ON DELETE SET NULL).
        assertThat(letters.findAll()).hasSize(3);
        assertThat(letters.findAll()).filteredOn(l -> l.worldId() == null).hasSize(2);
        assertThat(media.existsById(photo)).isTrue();
    }

    // --- letters -------------------------------------------------------------------------------------

    @Test
    void letterCrudKeepsRawMarkdownAndOrder() {
        String body = "# Hi <script>alert(1)</script>\n\n**bold** [x](javascript:void(0))\n" + "z".repeat(19000);
        Letter l = new Letter(ulids.next(), null, "First", body, RevealTrigger.SEALED_ICON, 5, Instant.now());
        letters.insert(l);
        assertThat(letters.nextSortOrder()).isEqualTo(6);
        assertThat(letters.findById(l.id()).orElseThrow().body()).isEqualTo(body);

        Letter edited = new Letter(l.id(), worlds.findAll().get(0).id(), "Edited", "b2", RevealTrigger.WORLD_OUTRO,
                1, l.createdAt());
        assertThat(letters.update(edited)).isTrue();
        assertThat(letters.findById(l.id()).orElseThrow()).usingRecursiveComparison()
                .ignoringFields("createdAt").isEqualTo(edited);
        assertThat(letters.update(new Letter(ulids.next(), null, "t", "b", RevealTrigger.WORLD_OUTRO, 1,
                Instant.now()))).isFalse();
        assertThat(letters.delete(l.id())).isTrue();
        assertThat(letters.delete(l.id())).isFalse();
        assertThat(letters.findById(l.id())).isEmpty();
    }

    @Test
    void lettersAreOrderedBySortOrder() {
        Letter late = new Letter(ulids.next(), null, "late", "b", RevealTrigger.SEALED_ICON, 9, Instant.now());
        Letter early = new Letter(ulids.next(), null, "early", "b", RevealTrigger.SEALED_ICON, 2, Instant.now());
        letters.insert(late);
        letters.insert(early);
        assertThat(letters.findAll()).extracting(Letter::title).containsExactly("early", "late");
        assertThat(letters.nextSortOrder()).isEqualTo(10);
    }
}
