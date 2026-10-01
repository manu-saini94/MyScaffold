package com.ourstory.content;

import static com.ourstory.content.ContentSupport.unprocessable;

import com.ourstory.common.ApiException;
import com.ourstory.common.UlidGenerator;
import com.ourstory.content.ContentDtos.LetterRequest;
import com.ourstory.content.ContentDtos.LetterResponse;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Service;

/** Letter CRUD. The markdown body is stored exactly as sent. */
@Service
public class LetterService {

    private final LetterRepository letters;
    private final WorldRepository worlds;
    private final UlidGenerator ulids;

    public LetterService(LetterRepository letters, WorldRepository worlds, UlidGenerator ulids) {
        this.letters = letters;
        this.worlds = worlds;
        this.ulids = ulids;
    }

    /** All letters, or only those of one world when {@code worldId} is given. */
    public List<LetterResponse> list(String worldId) {
        List<Letter> found = worldId == null ? letters.findAll() : letters.findByWorld(worldId);
        return found.stream().map(LetterResponse::of).toList();
    }

    public LetterResponse create(LetterRequest req) {
        requireWorldIfPresent(req.worldId());
        int sort = req.sortOrder() != null ? req.sortOrder() : letters.nextSortOrder();
        Letter letter = new Letter(ulids.next(), req.worldId(), req.title().strip(), req.body(),
                req.revealTrigger(), sort, ContentSupport.now());
        letters.insert(letter);
        return LetterResponse.of(letter);
    }

    public LetterResponse update(String id, LetterRequest req) {
        Letter existing = letters.findById(id).orElseThrow(() -> ApiException.notFound("Letter"));
        requireWorldIfPresent(req.worldId());
        int sort = req.sortOrder() != null ? req.sortOrder() : existing.sortOrder();
        Letter updated = new Letter(id, req.worldId(), req.title().strip(), req.body(), req.revealTrigger(),
                sort, existing.createdAt());
        letters.update(updated);
        return LetterResponse.of(updated);
    }

    public void delete(String id) {
        if (!letters.delete(id)) {
            throw ApiException.notFound("Letter");
        }
    }

    private void requireWorldIfPresent(String worldId) {
        if (worldId != null && !worlds.existsById(worldId)) {
            throw unprocessable("unknown-world", "World does not exist");
        }
    }
}
