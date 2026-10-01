package com.ourstory.content;

import static com.ourstory.content.ContentSupport.blankToNull;
import static com.ourstory.content.ContentSupport.unprocessable;

import com.ourstory.common.ApiException;
import com.ourstory.common.UlidGenerator;
import com.ourstory.content.ContentDtos.MomentInput;
import com.ourstory.content.ContentDtos.MomentResponse;
import com.ourstory.content.ContentDtos.MomentsRequest;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class MomentService {

    private final WorldRepository worlds;
    private final MomentRepository moments;
    private final UlidGenerator ulids;

    public MomentService(WorldRepository worlds, MomentRepository moments, UlidGenerator ulids) {
        this.worlds = worlds;
        this.moments = moments;
        this.ulids = ulids;
    }

    public List<MomentResponse> list(String worldId) {
        requireWorld(worldId);
        return moments.listByWorld(worldId).stream().map(MomentResponse::of).toList();
    }

    /** Replaces every moment of the world; array order is display order. Nothing changes on any error. */
    public List<MomentResponse> replace(String worldId, MomentsRequest req) {
        requireWorld(worldId);
        List<MomentInput> inputs = List.copyOf(req.moments());
        if (inputs.size() > ContentDtos.MAX_MOMENTS) {
            throw unprocessable("too-many-moments", "At most " + ContentDtos.MAX_MOMENTS + " moments per world");
        }
        requireNoDuplicates(inputs);
        requireMediaExist(inputs);
        List<Moment> toStore = inputs.stream().map(i -> toMoment(worldId, i)).toList();
        try {
            moments.replaceAll(worldId, toStore);
        } catch (DataIntegrityViolationException raced) {
            // The world or a photo vanished (or a duplicate appeared) between the checks above and the write.
            throw new ApiException(HttpStatus.CONFLICT, "moments-conflict",
                    "The world or some photos changed while saving. Reload and try again.");
        }
        return list(worldId);
    }

    private void requireWorld(String worldId) {
        if (!worlds.existsById(worldId)) {
            throw ApiException.notFound("World");
        }
    }

    private static void requireNoDuplicates(List<MomentInput> inputs) {
        Set<String> seen = new HashSet<>();
        List<String> duplicates = inputs.stream().map(MomentInput::mediaId).filter(id -> !seen.add(id))
                .distinct().toList();
        if (!duplicates.isEmpty()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "duplicate-media",
                    "A photo can appear only once in a world", Map.of("duplicateMediaIds", duplicates));
        }
    }

    private void requireMediaExist(List<MomentInput> inputs) {
        List<String> ids = inputs.stream().map(MomentInput::mediaId).distinct().toList();
        Set<String> existing = moments.existingMediaIds(ids);
        List<String> missing = ids.stream().filter(id -> !existing.contains(id)).toList();
        if (!missing.isEmpty()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "unknown-media",
                    "Some photos do not exist: " + String.join(", ", missing), Map.of("missingMediaIds", missing));
        }
    }

    private Moment toMoment(String worldId, MomentInput i) {
        return new Moment(ulids.next(), worldId, i.mediaId(), blankToNull(i.caption()), blankToNull(i.note()),
                i.happenedOn(), blankToNull(i.place()), 0, i.favourite());
    }
}
