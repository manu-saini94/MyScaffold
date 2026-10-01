package com.ourstory.content;

import static com.ourstory.content.ContentSupport.requireUlid;

import com.ourstory.content.ContentDtos.LetterRequest;
import com.ourstory.content.ContentDtos.LetterResponse;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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
@RequestMapping("/api/admin/letters")
class AdminLetterController {

    private final LetterService letters;

    AdminLetterController(LetterService letters) {
        this.letters = letters;
    }

    @GetMapping
    List<LetterResponse> list(@RequestParam(required = false) String worldId) {
        return letters.list(worldId == null ? null : requireUlid(worldId, "world"));
    }

    @PostMapping
    ResponseEntity<LetterResponse> create(@Valid @RequestBody LetterRequest request) {
        LetterResponse created = letters.create(request);
        return ResponseEntity.created(URI.create("/api/admin/letters/" + created.id())).body(created);
    }

    @PutMapping("/{id}")
    LetterResponse update(@PathVariable String id, @Valid @RequestBody LetterRequest request) {
        return letters.update(requireUlid(id, "letter"), request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable String id) {
        letters.delete(requireUlid(id, "letter"));
    }
}
