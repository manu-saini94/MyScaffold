package com.ourstory.content;

import static com.ourstory.content.ContentSupport.blankToNull;
import static com.ourstory.content.ContentSupport.unprocessable;

import com.ourstory.common.ApiException;
import com.ourstory.common.UlidGenerator;
import com.ourstory.content.ContentDtos.ReorderRequest;
import com.ourstory.content.ContentDtos.WorldRequest;
import com.ourstory.content.ContentDtos.WorldResponse;
import com.ourstory.media.MediaRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/** World CRUD rules. Field-shape rules (lengths, patterns) are bean validation on the request DTO. */
@Service
public class WorldService {

    private final WorldRepository worlds;
    private final MomentRepository moments;
    private final MediaRepository media;
    private final UlidGenerator ulids;
    private final Clock clock;

    public WorldService(WorldRepository worlds, MomentRepository moments, MediaRepository media,
            UlidGenerator ulids, Clock clock) {
        this.clock = clock;
        this.worlds = worlds;
        this.moments = moments;
        this.media = media;
        this.ulids = ulids;
    }

    public List<WorldResponse> listAll() {
        Map<String, Integer> counts = moments.countsByWorld();
        return worlds.findAll().stream().map(w -> WorldResponse.of(w, counts.getOrDefault(w.id(), 0))).toList();
    }

    public WorldResponse get(String id) {
        return WorldResponse.of(require(id), moments.countsByWorld().getOrDefault(id, 0));
    }

    public WorldResponse create(WorldRequest req) {
        requireSlugFree(req.slug(), null);
        requireCoverExists(req.coverMediaId());
        Instant now = ContentSupport.now(clock);
        World world = build(ulids.next(), req, worlds.nextSortOrder(), now, now, null);
        try {
            worlds.insert(world);
        } catch (DuplicateKeyException race) {
            throw slugConflict(req.slug());
        }
        return WorldResponse.of(world, 0);
    }

    public WorldResponse update(String id, WorldRequest req) {
        World existing = require(id);
        requireSlugFree(req.slug(), id);
        requireCoverExists(req.coverMediaId());
        World updated = build(id, req, existing.sortOrder(), existing.createdAt(), ContentSupport.now(clock),
                existing);
        try {
            if (!worlds.update(updated)) {
                throw ApiException.notFound("World");
            }
        } catch (DuplicateKeyException race) {
            throw slugConflict(req.slug());
        }
        return WorldResponse.of(updated, moments.countsByWorld().getOrDefault(id, 0));
    }

    /**
     * Deleting a world removes its moments (database cascade) but KEEPS its letters (world_id becomes NULL;
     * world-less letters are never shown to viewers). Because that is destructive the caller must confirm.
     */
    public void delete(String id, boolean confirmed) {
        require(id);
        if (!confirmed) {
            int momentCount = moments.countsByWorld().getOrDefault(id, 0);
            throw new ApiException(HttpStatus.BAD_REQUEST, "confirmation-required",
                    "Deleting this world removes its " + momentCount + " moment(s); its letters are kept but "
                            + "no longer shown to viewers. Repeat the request with ?confirm=true to proceed.",
                    Map.of("momentCount", momentCount));
        }
        if (!worlds.delete(id)) {
            throw ApiException.notFound("World");
        }
    }

    /** The ids must be exactly the existing world ids, each once, in the wanted order. */
    public List<WorldResponse> reorder(ReorderRequest req) {
        List<String> ordered = List.copyOf(req.orderedIds());
        var existing = new HashSet<>(worlds.findAll().stream().map(World::id).toList());
        if (ordered.size() != existing.size() || !existing.equals(new HashSet<>(ordered))) {
            throw unprocessable("invalid-order", "orderedIds must list every world id exactly once");
        }
        worlds.reorder(ordered);
        return listAll();
    }

    private World require(String id) {
        return worlds.findById(id).orElseThrow(() -> ApiException.notFound("World"));
    }

    private void requireSlugFree(String slug, String selfId) {
        worlds.findBySlug(slug).filter(w -> !w.id().equals(selfId)).ifPresent(w -> {
            throw slugConflict(slug);
        });
    }

    private void requireCoverExists(String coverMediaId) {
        if (coverMediaId != null && !media.existsById(coverMediaId)) {
            throw unprocessable("unknown-media", "Cover media does not exist");
        }
    }

    private static ApiException slugConflict(String slug) {
        return new ApiException(HttpStatus.CONFLICT, "slug-conflict", "A world with slug '" + slug + "' exists");
    }

    /**
     * @param existing the stored world on update (omitted {@code published} and {@code unlockAt} keep its
     *                 values), or null on create (published defaults to true, unlockAt to open)
     */
    private static World build(String id, WorldRequest r, int sortOrder, Instant created, Instant updated,
            World existing) {
        boolean published = r.published() != null ? r.published() : existing == null || existing.published();
        Instant unlockAt = r.unlockAtOr(existing == null ? null : existing.unlockAt());
        return new World(id, r.slug(), r.title().strip(), blankToNull(r.subtitle()), blankToNull(r.tagline()),
                r.layout(), r.coverMediaId(), r.themeAccent(), sortOrder, unlockAt,
                blankToNull(r.introText()), blankToNull(r.outroText()), r.musicUrl(), published, created, updated);
    }
}
