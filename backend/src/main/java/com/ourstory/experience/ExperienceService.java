package com.ourstory.experience;

import com.ourstory.content.MomentRepository;
import com.ourstory.content.World;
import com.ourstory.content.WorldRepository;
import com.ourstory.experience.ExperienceDtos.Experience;
import com.ourstory.experience.ExperienceDtos.LockedWorldCard;
import com.ourstory.experience.ExperienceDtos.MediaRef;
import com.ourstory.experience.ExperienceDtos.OpenWorldCard;
import com.ourstory.experience.ExperienceDtos.Profile;
import com.ourstory.experience.ExperienceDtos.WorldCard;
import com.ourstory.media.MediaCard;
import com.ourstory.media.MediaRepository;
import com.ourstory.settings.SettingsService;
import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.stereotype.Service;

/**
 * Builds the single aggregated payload the SPA needs after unlock. A fixed number of SQL statements
 * regardless of how many worlds or moments exist (grouped queries, no per-world lookups). Nothing is cached:
 * locking is by time and {@code serverTime} must be fresh.
 */
@Service
public class ExperienceService {

    static final int PREVIEW_LIMIT = 3;
    static final int HERO_FALLBACK_MAX = 8;

    private final WorldRepository worlds;
    private final MomentRepository moments;
    private final MediaRepository media;
    private final SettingsService settings;
    private final Clock clock;

    public ExperienceService(WorldRepository worlds, MomentRepository moments, MediaRepository media,
            SettingsService settings, Clock clock) {
        this.worlds = worlds;
        this.moments = moments;
        this.media = media;
        this.settings = settings;
        this.clock = clock;
    }

    /** @param admin true for an ADMIN caller: unpublished worlds are included and nothing is locked */
    public Experience build(boolean admin) {
        Instant now = clock.instant();
        List<World> all = admin ? worlds.findAll() : worlds.findPublished();
        List<World> open = all.stream().filter(w -> admin || !WorldAccess.isTimeLocked(w, now)).toList();
        Map<String, List<String>> previews = moments.firstMediaIdsByWorld(PREVIEW_LIMIT);
        List<String> configuredHero = configuredHeroIds(admin, now);
        List<String> fallbackHero = fallbackHeroIds(open, previews);

        Set<String> cardIds = new LinkedHashSet<>(configuredHero);
        cardIds.addAll(fallbackHero);
        Map<String, MediaCard> cards = media.findCards(cardIds);

        Map<String, Integer> counts = moments.countsByWorld();
        List<WorldCard> cardsOut = all.stream()
                .map(w -> card(w, admin, now, cards, counts, previews)).toList();
        return new Experience(now, settings.appTitle(), settings.tagline(), settings.defaultTheme(),
                settings.specialDate(), settings.easterEggNicknames(),
                List.of(new Profile("her", settings.herName(), "viewer"),
                        new Profile("me", settings.myName(), "decoy")),
                hero(configuredHero, fallbackHero, cards), cardsOut, admin ? Boolean.TRUE : null);
    }

    private WorldCard card(World w, boolean admin, Instant now, Map<String, MediaCard> cards,
            Map<String, Integer> counts, Map<String, List<String>> previews) {
        if (!admin && WorldAccess.isTimeLocked(w, now)) {
            return new LockedWorldCard(w.slug(), w.title(), w.subtitle(), w.layout(), w.themeAccent(),
                    w.sortOrder(), true, w.unlockAt());
        }
        MediaCard cover = w.coverMediaId() == null ? null : cards.get(w.coverMediaId());
        return new OpenWorldCard(w.slug(), w.title(), w.subtitle(), w.tagline(), w.layout(), w.themeAccent(),
                w.sortOrder(), false, counts.getOrDefault(w.id(), 0), cover == null ? null : ref(cover),
                previews.getOrDefault(w.id(), List.of()));
    }

    /** Hero ids from settings that a viewer may see (admin: all); stale or foreign ids simply fall away. */
    private List<String> configuredHeroIds(boolean admin, Instant now) {
        List<String> configured = settings.heroMediaIds();
        if (admin) {
            return configured;
        }
        Set<String> visible = media.findViewerVisibleIds(configured, now);
        return configured.stream().filter(visible::contains).toList();
    }

    /** Covers of open worlds first, then the first moment photo of each open world. */
    private static List<String> fallbackHeroIds(List<World> open, Map<String, List<String>> previews) {
        Set<String> ids = new LinkedHashSet<>();
        open.stream().map(World::coverMediaId).filter(Objects::nonNull).forEach(ids::add);
        open.forEach(w -> previews.getOrDefault(w.id(), List.of()).stream().findFirst().ifPresent(ids::add));
        return List.copyOf(ids);
    }

    private static List<MediaRef> hero(List<String> configured, List<String> fallback,
            Map<String, MediaCard> cards) {
        List<MediaRef> hero = configured.stream().distinct().map(cards::get).filter(Objects::nonNull)
                .map(ExperienceService::ref).toList();
        if (!hero.isEmpty()) {
            return hero;
        }
        return fallback.stream().map(cards::get).filter(Objects::nonNull).limit(HERO_FALLBACK_MAX)
                .map(ExperienceService::ref).toList();
    }

    private static MediaRef ref(MediaCard c) {
        return new MediaRef(c.id(), c.width(), c.height(), c.lqip(), c.dominantColor());
    }
}
