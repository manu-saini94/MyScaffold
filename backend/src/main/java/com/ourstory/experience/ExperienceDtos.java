package com.ourstory.experience;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.ourstory.content.RevealTrigger;
import com.ourstory.content.WorldLayout;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * Response shapes of the viewer API. Locked and open worlds are DIFFERENT types so a locked world cannot
 * accidentally carry cover, counts or text: the field set is fixed at compile time.
 */
public final class ExperienceDtos {

    private ExperienceDtos() {
    }

    /** Placeholder + layout data for one photo; the bytes come from /api/media/{mediaId}/{size}. */
    public record MediaRef(String mediaId, Integer width, Integer height, String lqip, String dominantColor) {
    }

    public record Profile(String id, String name, String role) {
    }

    /** One entry of {@link Experience#worlds()}: {@link LockedWorldCard} or {@link OpenWorldCard}. */
    public sealed interface WorldCard permits LockedWorldCard, OpenWorldCard {
    }

    /** Teaser only: nothing beyond what the lock screen needs. */
    public record LockedWorldCard(String slug, String title, String subtitle, WorldLayout layout,
            String themeAccent, int sortOrder, boolean locked, Instant unlockAt) implements WorldCard {
    }

    public record OpenWorldCard(String slug, String title, String subtitle, String tagline, WorldLayout layout,
            String themeAccent, int sortOrder, boolean locked, int momentCount, MediaRef cover,
            List<String> previewMediaIds) implements WorldCard {
    }

    public record Experience(Instant serverTime, String appTitle, String tagline, String defaultTheme,
            LocalDate specialDate, List<String> easterEggNicknames, List<Profile> profiles, List<MediaRef> hero,
            List<WorldCard> worlds, @JsonInclude(JsonInclude.Include.NON_NULL) Boolean adminPreview) {
    }

    /** Body of GET /api/worlds/{slug}: {@link LockedWorldDetail} or {@link OpenWorldDetail}. */
    public sealed interface WorldDetail permits LockedWorldDetail, OpenWorldDetail {
    }

    public record LockedWorldDetail(String slug, String title, String subtitle, WorldLayout layout,
            String themeAccent, boolean locked, Instant unlockAt, Instant serverTime) implements WorldDetail {
    }

    public record OpenWorldDetail(String slug, String title, String subtitle, String tagline, WorldLayout layout,
            String themeAccent, boolean locked, String introText, String outroText, String musicUrl,
            String nextSlug, Instant serverTime, List<MomentView> moments, List<LetterView> letters,
            @JsonInclude(JsonInclude.Include.NON_NULL) Boolean adminPreview) implements WorldDetail {
    }

    public record MomentView(String id, int sortOrder, String caption, String note, LocalDate happenedOn,
            String place, boolean favourite, MomentMedia media) {
    }

    public record MomentMedia(String mediaId, String mimeType, Integer width, Integer height, String lqip,
            String dominantColor, Instant takenAt) {
    }

    /** {@code body} is RAW markdown: the client must render it safely (never innerHTML). */
    public record LetterView(String id, String title, String body, RevealTrigger revealTrigger) {
    }
}
