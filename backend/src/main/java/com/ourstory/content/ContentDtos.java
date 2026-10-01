package com.ourstory.content;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Request and response bodies of the admin content API. Distinct from the domain records. */
public final class ContentDtos {

    static final String SLUG = "^[a-z0-9]+(-[a-z0-9]+)*$";
    static final String ULID = "^[0-7][0-9A-HJKMNP-TV-Z]{25}$";
    static final String ACCENT = "^#[0-9a-fA-F]{6}$";
    static final String HTTPS_URL = "^https://[^\\s/?#]+[^\\s]*$";
    static final int MAX_MOMENTS = 500;

    private ContentDtos() {
    }

    public record WorldRequest(
            @NotBlank @Size(max = 64) @Pattern(regexp = SLUG, message = "must be kebab-case (a-z, 0-9, hyphens)")
            String slug,
            @NotBlank @Size(max = 120) String title,
            @Size(max = 200) String subtitle,
            @Size(max = 200) String tagline,
            @NotNull WorldLayout layout,
            @Pattern(regexp = ULID, message = "must be a media id") String coverMediaId,
            @Pattern(regexp = ACCENT, message = "must be a #rrggbb colour") String themeAccent,
            Instant unlockAt,
            @Size(max = 2000) String introText,
            @Size(max = 2000) String outroText,
            @Size(max = 500) @Pattern(regexp = HTTPS_URL, message = "must be an https URL") String musicUrl,
            Boolean published) {
    }

    public record WorldResponse(String id, String slug, String title, String subtitle, String tagline,
            WorldLayout layout, String coverMediaId, String themeAccent, int sortOrder, Instant unlockAt,
            String introText, String outroText, String musicUrl, boolean published, int momentCount,
            Instant createdAt, Instant updatedAt) {

        static WorldResponse of(World w, int momentCount) {
            return new WorldResponse(w.id(), w.slug(), w.title(), w.subtitle(), w.tagline(), w.layout(),
                    w.coverMediaId(), w.themeAccent(), w.sortOrder(), w.unlockAt(), w.introText(), w.outroText(),
                    w.musicUrl(), w.published(), momentCount, w.createdAt(), w.updatedAt());
        }
    }

    public record ReorderRequest(@NotNull List<String> orderedIds) {
    }

    public record MomentInput(
            @NotBlank @Pattern(regexp = ULID, message = "must be a media id") String mediaId,
            @Size(max = 500) String caption,
            @Size(max = 2000) String note,
            LocalDate happenedOn,
            @Size(max = 200) String place,
            boolean favourite) {
    }

    public record MomentsRequest(@NotNull List<@NotNull @Valid MomentInput> moments) {
    }

    public record MomentResponse(String id, String mediaId, String caption, String note, LocalDate happenedOn,
            String place, int sortOrder, boolean favourite, String mimeType, Integer width, Integer height,
            String lqip, String dominantColor, Instant takenAt) {

        static MomentResponse of(MomentWithMedia m) {
            return new MomentResponse(m.id(), m.mediaId(), m.caption(), m.note(), m.happenedOn(), m.place(),
                    m.sortOrder(), m.favourite(), m.mimeType(), m.width(), m.height(), m.lqip(),
                    m.dominantColor(), m.takenAt());
        }
    }

    public record LetterRequest(
            @Pattern(regexp = ULID, message = "must be a world id") String worldId,
            @NotBlank @Size(max = 160) String title,
            @NotBlank @Size(max = 20000) String body,
            @NotNull RevealTrigger revealTrigger,
            Integer sortOrder) {
    }

    public record LetterResponse(String id, String worldId, String title, String body,
            RevealTrigger revealTrigger, int sortOrder, Instant createdAt) {

        static LetterResponse of(Letter l) {
            return new LetterResponse(l.id(), l.worldId(), l.title(), l.body(), l.revealTrigger(),
                    l.sortOrder(), l.createdAt());
        }
    }
}
