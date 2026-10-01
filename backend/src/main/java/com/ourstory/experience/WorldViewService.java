package com.ourstory.experience;

import com.ourstory.common.ApiException;
import com.ourstory.content.Letter;
import com.ourstory.content.LetterRepository;
import com.ourstory.content.MomentRepository;
import com.ourstory.content.MomentWithMedia;
import com.ourstory.content.World;
import com.ourstory.content.WorldRepository;
import com.ourstory.experience.ExperienceDtos.LetterView;
import com.ourstory.experience.ExperienceDtos.LockedWorldDetail;
import com.ourstory.experience.ExperienceDtos.MomentMedia;
import com.ourstory.experience.ExperienceDtos.MomentView;
import com.ourstory.experience.ExperienceDtos.OpenWorldDetail;
import com.ourstory.experience.ExperienceDtos.WorldDetail;
import java.time.Clock;
import java.time.Instant;
import java.util.Comparator;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

/** One world for the viewer: full content when open, a teaser when locked, 404 when not visible. */
@Service
public class WorldViewService {

    static final Pattern SLUG = Pattern.compile("^[a-z0-9]+(-[a-z0-9]+)*$");
    static final int SLUG_MAX = 64;
    private static final Comparator<World> DISPLAY_ORDER =
            Comparator.comparingInt(World::sortOrder).thenComparing(World::id);

    private final WorldRepository worlds;
    private final MomentRepository moments;
    private final LetterRepository letters;
    private final Clock clock;

    public WorldViewService(WorldRepository worlds, MomentRepository moments, LetterRepository letters,
            Clock clock) {
        this.worlds = worlds;
        this.moments = moments;
        this.letters = letters;
        this.clock = clock;
    }

    /**
     * @throws ApiException 400 for a malformed slug; 404 (same body) for an unknown world and, for viewers,
     *         for an unpublished one
     */
    public WorldDetail view(String slug, boolean admin) {
        if (slug == null || slug.length() > SLUG_MAX || !SLUG.matcher(slug).matches()) {
            throw ApiException.badRequest("Invalid world slug");
        }
        World world = worlds.findBySlug(slug).filter(w -> admin || w.published())
                .orElseThrow(() -> ApiException.notFound("World"));
        Instant now = clock.instant();
        boolean timeLocked = WorldAccess.isTimeLocked(world, now);
        if (timeLocked && !admin) {
            return new LockedWorldDetail(world.slug(), world.title(), world.subtitle(), world.layout(),
                    world.themeAccent(), true, world.unlockAt(), now);
        }
        boolean preview = admin && (timeLocked || !world.published());
        return new OpenWorldDetail(world.slug(), world.title(), world.subtitle(), world.tagline(), world.layout(),
                world.themeAccent(), false, world.introText(), world.outroText(), world.musicUrl(),
                nextSlug(world), now,
                moments.listByWorld(world.id()).stream().map(WorldViewService::moment).toList(),
                letters.findByWorld(world.id()).stream().map(WorldViewService::letter).toList(),
                preview ? Boolean.TRUE : null);
    }

    /** The next PUBLISHED world in display order (it may itself be locked), or null for the last one. */
    private String nextSlug(World current) {
        return worlds.findPublished().stream().filter(w -> DISPLAY_ORDER.compare(w, current) > 0)
                .min(DISPLAY_ORDER).map(World::slug).orElse(null);
    }

    private static MomentView moment(MomentWithMedia m) {
        return new MomentView(m.id(), m.sortOrder(), m.caption(), m.note(), m.happenedOn(), m.place(),
                m.favourite(), new MomentMedia(m.mediaId(), m.mimeType(), m.width(), m.height(), m.lqip(),
                        m.dominantColor(), m.takenAt()));
    }

    private static LetterView letter(Letter l) {
        return new LetterView(l.id(), l.title(), l.body(), l.revealTrigger());
    }
}
