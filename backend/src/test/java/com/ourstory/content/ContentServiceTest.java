package com.ourstory.content;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ourstory.common.ApiException;
import com.ourstory.content.ContentDtos.LetterRequest;
import com.ourstory.content.ContentDtos.LetterResponse;
import com.ourstory.content.ContentDtos.MomentInput;
import com.ourstory.content.ContentDtos.MomentResponse;
import com.ourstory.content.ContentDtos.MomentsRequest;
import com.ourstory.content.ContentDtos.ReorderRequest;
import com.ourstory.content.ContentDtos.WorldRequest;
import com.ourstory.content.ContentDtos.WorldResponse;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;

/** Business rules of the three services against the real database. */
class ContentServiceTest extends ContentTestBase {

    @Autowired WorldService worldService;
    @Autowired MomentService momentService;
    @Autowired LetterService letterService;
    @Autowired java.time.Clock clock;
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean WorldRepository spyWorlds;
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean LetterRepository spyLetters;
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean MomentRepository spyMoments;

    private static WorldRequest req(String slug) {
        return new WorldRequest(slug, "  A Title  ", "  ", "tag", WorldLayout.MEMORY_WALL, null, "#aabbcc",
                at("2027-02-14T00:00:00Z"), "intro", null, "https://music.test/a.mp3", null);
    }

    private static Presence<Instant> at(String instant) {
        return new Presence<>(Instant.parse(instant));
    }

    private static MomentInput input(String mediaId) {
        return new MomentInput(mediaId, "cap", null, null, "  ", true);
    }

    private static void assertApi(Runnable call, HttpStatus status, String code) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(ApiException.class, e -> {
            assertThat(e.status()).isEqualTo(status);
            assertThat(e.code()).isEqualTo(code);
        });
    }

    // --- worlds --------------------------------------------------------------------------------------

    @Test
    void createAppendsLastNormalisesTextAndDefaultsPublished() {
        WorldResponse created = worldService.create(req("brand-new"));
        assertThat(created.sortOrder()).isEqualTo(7);
        assertThat(created.title()).isEqualTo("A Title");
        assertThat(created.subtitle()).isNull();
        assertThat(created.published()).isTrue();
        assertThat(created.momentCount()).isZero();
        assertThat(created.unlockAt()).isEqualTo(Instant.parse("2027-02-14T00:00:00Z"));
        assertThat(worldService.create(req("brand-newer")).sortOrder()).isEqualTo(8);
        assertThat(worldService.listAll()).hasSize(8);
    }

    @Test
    void duplicateSlugIs409OnCreateAndOnUpdateOfAnotherWorldButNotOnSelf() {
        assertApi(() -> worldService.create(req("our-firsts")), HttpStatus.CONFLICT, "slug-conflict");
        WorldResponse w = worldService.create(req("mine"));
        assertApi(() -> worldService.update(w.id(), req("our-firsts")), HttpStatus.CONFLICT, "slug-conflict");
        assertThat(worldService.update(w.id(), req("mine")).title()).isEqualTo("A Title");
    }

    @Test
    void unknownCoverMediaIs422AndKnownCoverIsStored() {
        String missing = ulids.next();
        WorldRequest bad = new WorldRequest("with-cover", "T", null, null, WorldLayout.FILM_STRIP, missing, null, null,
                null, null, null, false);
        assertApi(() -> worldService.create(bad), HttpStatus.UNPROCESSABLE_ENTITY, "unknown-media");
        String cover = seedMedia();
        WorldResponse ok = worldService.create(new WorldRequest("with-cover", "T", null, null, WorldLayout.FILM_STRIP,
                cover, null, null, null, null, null, false));
        assertThat(ok.coverMediaId()).isEqualTo(cover);
        assertThat(ok.published()).isFalse();
        assertApi(() -> worldService.update(ok.id(), bad), HttpStatus.UNPROCESSABLE_ENTITY, "unknown-media");
    }

    @Test
    void updateKeepsSortOrderAndCreatedAtAndIs404WhenUnknown() {
        World seed = worlds.findBySlug("our-firsts").orElseThrow();
        WorldResponse updated = worldService.update(seed.id(), req("our-firsts"));
        assertThat(updated.sortOrder()).isEqualTo(seed.sortOrder());
        assertThat(updated.createdAt()).isEqualTo(seed.createdAt());
        assertThat(updated.layout()).isEqualTo(WorldLayout.MEMORY_WALL);
        assertApi(() -> worldService.update(ulids.next(), req("zzz")), HttpStatus.NOT_FOUND, "not-found");
        assertApi(() -> worldService.get(ulids.next()), HttpStatus.NOT_FOUND, "not-found");
        assertApi(() -> worldService.delete(ulids.next(), true), HttpStatus.NOT_FOUND, "not-found");
    }

    @Test
    void listAndGetReportMomentCounts() {
        WorldResponse w = worldService.create(req("counted"));
        momentService.replace(w.id(), new MomentsRequest(List.of(input(seedMedia()), input(seedMedia()))));
        assertThat(worldService.get(w.id()).momentCount()).isEqualTo(2);
        assertThat(worldService.listAll()).filteredOn(x -> x.id().equals(w.id())).extracting(WorldResponse::momentCount)
                .containsExactly(2);
        assertThat(worldService.listAll()).filteredOn(x -> !x.id().equals(w.id()))
                .allMatch(x -> x.momentCount() == 0);
        assertThat(worldService.update(w.id(), req("counted")).momentCount()).isEqualTo(2);
    }

    @Test
    void deleteRemovesMomentsButKeepsLettersWithoutAWorld() {
        WorldResponse w = worldService.create(req("doomed"));
        momentService.replace(w.id(), new MomentsRequest(List.of(input(seedMedia()))));
        LetterResponse letter = letterService.create(
                new LetterRequest(w.id(), "t", "b", RevealTrigger.WORLD_OUTRO, null));
        worldService.delete(w.id(), true);
        assertThat(letterService.list(w.id())).isEmpty();
        assertThat(letterService.list(null)).extracting(LetterResponse::id).contains(letter.id());
        assertThat(letterService.list(null)).filteredOn(l -> l.id().equals(letter.id()))
                .extracting(LetterResponse::worldId).containsOnlyNulls();
        assertThat(jdbc.sql("SELECT COUNT(*) FROM moment").query(Long.class).single()).isZero();
    }

    @Test
    void deleteWithoutConfirmationIs400AndChangesNothing() {
        WorldResponse w = worldService.create(req("unconfirmed"));
        momentService.replace(w.id(), new MomentsRequest(List.of(input(seedMedia()), input(seedMedia()))));
        assertThatThrownBy(() -> worldService.delete(w.id(), false)).isInstanceOfSatisfying(ApiException.class, e -> {
            assertThat(e.status()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(e.code()).isEqualTo("confirmation-required");
            assertThat(e.properties()).containsEntry("momentCount", 2);
            assertThat(e.getMessage()).contains("2 moment(s)").contains("letters are kept");
        });
        assertThat(worldService.get(w.id()).momentCount()).isEqualTo(2);
    }

    @Test
    void updateKeepsOmittedPublishedAndUnlockAtAndClearsOnExplicitNull() {
        Instant first = Instant.parse("2027-02-14T00:00:00Z");
        Instant second = Instant.parse("2028-01-01T00:00:00Z");
        WorldResponse w = worldService.create(new WorldRequest("tri-state", "T", null, null, WorldLayout.POSTCARDS,
                null, null, at("2027-02-14T00:00:00Z"), null, null, null, false));
        assertThat(w.published()).isFalse();
        // omitted published and omitted unlockAt keep what is stored
        WorldResponse kept = worldService.update(w.id(), new WorldRequest("tri-state", "T2", null, null,
                WorldLayout.POSTCARDS, null, null, null, null, null, null, null));
        assertThat(kept.published()).isFalse();
        assertThat(kept.unlockAt()).isEqualTo(first);
        // explicit values replace
        WorldResponse changed = worldService.update(w.id(), new WorldRequest("tri-state", "T2", null, null,
                WorldLayout.POSTCARDS, null, null, new Presence<>(second), null, null, null, true));
        assertThat(changed.published()).isTrue();
        assertThat(changed.unlockAt()).isEqualTo(second);
        // explicit null clears the unlock time but published (omitted) stays
        WorldResponse cleared = worldService.update(w.id(), new WorldRequest("tri-state", "T2", null, null,
                WorldLayout.POSTCARDS, null, null, new Presence<>(null), null, null, null, null));
        assertThat(cleared.unlockAt()).isNull();
        assertThat(cleared.published()).isTrue();
        // create: omitted published defaults to true, omitted unlockAt means open
        WorldResponse created = worldService.create(new WorldRequest("tri-created", "T", null, null,
                WorldLayout.POSTCARDS, null, null, null, null, null, null, null));
        assertThat(created.published()).isTrue();
        assertThat(created.unlockAt()).isNull();
    }

    @Test
    void timestampsComeFromTheInjectedClock() {
        Instant fixed = Instant.parse("2030-05-06T07:08:09.123Z");
        java.time.Clock frozen = java.time.Clock.fixed(fixed, java.time.ZoneOffset.UTC);
        WorldResponse created = new WorldService(worlds, moments, media, ulids, frozen).create(req("clocked"));
        assertThat(created.createdAt()).isEqualTo(fixed);
        assertThat(created.updatedAt()).isEqualTo(fixed);
        LetterResponse letter = new LetterService(letters, worlds, ulids, frozen)
                .create(new LetterRequest(null, "t", "b", RevealTrigger.SEALED_ICON, null));
        assertThat(letter.createdAt()).isEqualTo(fixed);
    }

    @Test
    void updatesReportNotFoundWhenTheRowVanishesBeforeTheWrite() {
        WorldResponse w = worldService.create(req("racy"));
        org.mockito.Mockito.doReturn(false).when(spyWorlds).update(org.mockito.ArgumentMatchers.any());
        assertApi(() -> worldService.update(w.id(), req("racy")), HttpStatus.NOT_FOUND, "not-found");

        LetterResponse l = letterService.create(new LetterRequest(null, "t", "b", RevealTrigger.SEALED_ICON, null));
        org.mockito.Mockito.doReturn(false).when(spyLetters).update(org.mockito.ArgumentMatchers.any());
        assertApi(() -> letterService.update(l.id(),
                new LetterRequest(null, "t2", "b", RevealTrigger.SEALED_ICON, null)),
                HttpStatus.NOT_FOUND, "not-found");
    }

    @Test
    void aWriteRaceInReplaceMomentsBecomesA409NotA500() {
        WorldResponse w = worldService.create(req("racing-moments"));
        org.mockito.Mockito.doThrow(new org.springframework.dao.DataIntegrityViolationException("fk"))
                .when(spyMoments).replaceAll(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
        assertApi(() -> momentService.replace(w.id(), new MomentsRequest(List.of(input(seedMedia())))),
                HttpStatus.CONFLICT, "moments-conflict");
    }

    @Test
    void reorderMustBeAnExactPermutation() {
        List<String> ids = new ArrayList<>(worlds.findAll().stream().map(World::id).toList());
        assertApi(() -> worldService.reorder(new ReorderRequest(ids.subList(1, 6))), HttpStatus.UNPROCESSABLE_ENTITY,
                "invalid-order");
        List<String> withUnknown = new ArrayList<>(ids.subList(1, 6));
        withUnknown.add(ulids.next());
        assertApi(() -> worldService.reorder(new ReorderRequest(withUnknown)), HttpStatus.UNPROCESSABLE_ENTITY,
                "invalid-order");
        List<String> duplicated = new ArrayList<>(ids.subList(0, 5));
        duplicated.add(ids.get(0));
        assertApi(() -> worldService.reorder(new ReorderRequest(duplicated)), HttpStatus.UNPROCESSABLE_ENTITY,
                "invalid-order");
        List<String> extra = new ArrayList<>(ids);
        extra.add(ids.get(0));
        assertApi(() -> worldService.reorder(new ReorderRequest(extra)), HttpStatus.UNPROCESSABLE_ENTITY,
                "invalid-order");
        assertThat(worlds.findAll()).extracting(World::id).containsExactlyElementsOf(ids);

        List<String> swapped = new ArrayList<>(ids);
        swapped.set(0, ids.get(5));
        swapped.set(5, ids.get(0));
        assertThat(worldService.reorder(new ReorderRequest(swapped))).extracting(WorldResponse::id)
                .containsExactlyElementsOf(swapped);
    }

    // --- moments -------------------------------------------------------------------------------------

    @Test
    void replaceStoresArrayOrderFlagsAndNormalisedText() {
        WorldResponse w = worldService.create(req("moments"));
        String a = seedMedia();
        String b = seedMedia();
        List<MomentResponse> out = momentService.replace(w.id(), new MomentsRequest(List.of(input(b), input(a))));
        assertThat(out).extracting(MomentResponse::mediaId).containsExactly(b, a);
        assertThat(out).extracting(MomentResponse::sortOrder).containsExactly(1, 2);
        assertThat(out.get(0).favourite()).isTrue();
        assertThat(out.get(0).place()).isNull();
        assertThat(out.get(0).width()).isEqualTo(400);
        assertThat(momentService.list(w.id())).hasSize(2);

        assertThat(momentService.replace(w.id(), new MomentsRequest(List.of()))).isEmpty();
    }

    @Test
    void unknownMediaIs422ListingEveryMissingIdAndLeavesDataUntouched() {
        WorldResponse w = worldService.create(req("missing"));
        String ok = seedMedia();
        momentService.replace(w.id(), new MomentsRequest(List.of(input(ok))));
        String m1 = ulids.next();
        String m2 = ulids.next();
        assertThatThrownBy(() -> momentService.replace(w.id(),
                new MomentsRequest(List.of(input(m1), input(ok), input(m2)))))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.status()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
                    assertThat(e.properties().get("missingMediaIds")).isEqualTo(List.of(m1, m2));
                    assertThat(e.getMessage()).contains(m1).contains(m2).doesNotContain(ok);
                });
        assertThat(momentService.list(w.id())).extracting(MomentResponse::mediaId).containsExactly(ok);
    }

    @Test
    void duplicateMediaIdsAre422() {
        WorldResponse w = worldService.create(req("dups"));
        String a = seedMedia();
        assertThatThrownBy(() -> momentService.replace(w.id(), new MomentsRequest(List.of(input(a), input(a)))))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.code()).isEqualTo("duplicate-media");
                    assertThat(e.properties().get("duplicateMediaIds")).isEqualTo(List.of(a));
                });
    }

    @Test
    void moreThan500MomentsIs422AndExactly500Passes() {
        WorldResponse w = worldService.create(req("many"));
        List<MomentInput> tooMany = new ArrayList<>();
        for (int i = 0; i <= 500; i++) {
            tooMany.add(input(ulids.next()));
        }
        assertApi(() -> momentService.replace(w.id(), new MomentsRequest(tooMany)), HttpStatus.UNPROCESSABLE_ENTITY,
                "too-many-moments");
        // 500 passes the size rule (then fails on unknown media, proving the size check was not the blocker)
        assertApi(() -> momentService.replace(w.id(), new MomentsRequest(tooMany.subList(0, 500))),
                HttpStatus.UNPROCESSABLE_ENTITY, "unknown-media");
    }

    @Test
    void momentsOfUnknownWorldIs404() {
        assertApi(() -> momentService.list(ulids.next()), HttpStatus.NOT_FOUND, "not-found");
        assertApi(() -> momentService.replace(ulids.next(), new MomentsRequest(List.of())), HttpStatus.NOT_FOUND,
                "not-found");
    }

    // --- letters -------------------------------------------------------------------------------------

    @Test
    void letterLifecycleWithWorldFilterAndAppendOrdering() {
        WorldResponse w = worldService.create(req("letters"));
        LetterResponse first = letterService.create(new LetterRequest(w.id(), " Dear you ", "# md\n<b>x</b>",
                RevealTrigger.WORLD_OUTRO, null));
        LetterResponse second = letterService.create(new LetterRequest(null, "Sealed", "b", RevealTrigger.SEALED_ICON,
                null));
        assertThat(first.title()).isEqualTo("Dear you");
        assertThat(first.body()).isEqualTo("# md\n<b>x</b>");
        assertThat(second.sortOrder()).isGreaterThan(first.sortOrder());
        assertThat(letterService.list(null)).hasSize(2);
        assertThat(letterService.list(w.id())).extracting(LetterResponse::id).containsExactly(first.id());

        LetterResponse kept = letterService.update(first.id(), new LetterRequest(null, "New", "b2",
                RevealTrigger.SEALED_ICON, null));
        assertThat(kept.sortOrder()).isEqualTo(first.sortOrder());
        assertThat(kept.worldId()).isNull();
        assertThat(kept.createdAt()).isEqualTo(first.createdAt());
        LetterResponse moved = letterService.update(first.id(), new LetterRequest(null, "New", "b2",
                RevealTrigger.SEALED_ICON, 99));
        assertThat(moved.sortOrder()).isEqualTo(99);
        letterService.delete(first.id());
        assertThat(letterService.list(null)).extracting(LetterResponse::id).containsExactly(second.id());
    }

    @Test
    void letterRulesUnknownWorldAndUnknownLetter() {
        String ghost = ulids.next();
        LetterRequest bad = new LetterRequest(ghost, "t", "b", RevealTrigger.WORLD_OUTRO, 3);
        assertApi(() -> letterService.create(bad), HttpStatus.UNPROCESSABLE_ENTITY, "unknown-world");
        assertApi(() -> letterService.update(ulids.next(), bad), HttpStatus.NOT_FOUND, "not-found");
        LetterResponse l = letterService.create(new LetterRequest(null, "t", "b", RevealTrigger.WORLD_OUTRO, 1));
        assertApi(() -> letterService.update(l.id(), bad), HttpStatus.UNPROCESSABLE_ENTITY, "unknown-world");
        assertApi(() -> letterService.delete(ulids.next()), HttpStatus.NOT_FOUND, "not-found");
    }
}
