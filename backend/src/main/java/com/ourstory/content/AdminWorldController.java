package com.ourstory.content;

import static com.ourstory.content.ContentSupport.requireUlid;

import com.ourstory.content.ContentDtos.MomentResponse;
import com.ourstory.content.ContentDtos.MomentsRequest;
import com.ourstory.content.ContentDtos.ReorderRequest;
import com.ourstory.content.ContentDtos.WorldRequest;
import com.ourstory.content.ContentDtos.WorldResponse;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/worlds")
class AdminWorldController {

    private final WorldService worlds;
    private final MomentService moments;

    AdminWorldController(WorldService worlds, MomentService moments) {
        this.worlds = worlds;
        this.moments = moments;
    }

    @GetMapping
    List<WorldResponse> list() {
        return worlds.listAll();
    }

    @GetMapping("/{id}")
    WorldResponse get(@PathVariable String id) {
        return worlds.get(requireUlid(id, "world"));
    }

    @PostMapping
    ResponseEntity<WorldResponse> create(@Valid @RequestBody WorldRequest request) {
        WorldResponse created = worlds.create(request);
        return ResponseEntity.created(URI.create("/api/admin/worlds/" + created.id())).body(created);
    }

    @PutMapping("/{id}")
    WorldResponse update(@PathVariable String id, @Valid @RequestBody WorldRequest request) {
        return worlds.update(requireUlid(id, "world"), request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable String id, @RequestParam(defaultValue = "false") boolean confirm) {
        worlds.delete(requireUlid(id, "world"), confirm);
    }

    @PutMapping("/reorder")
    List<WorldResponse> reorder(@Valid @RequestBody ReorderRequest request) {
        return worlds.reorder(request);
    }

    @GetMapping("/{id}/moments")
    List<MomentResponse> listMoments(@PathVariable String id) {
        return moments.list(requireUlid(id, "world"));
    }

    @PutMapping("/{id}/moments")
    List<MomentResponse> replaceMoments(@PathVariable String id, @Valid @RequestBody MomentsRequest request) {
        return moments.replace(requireUlid(id, "world"), request);
    }
}
