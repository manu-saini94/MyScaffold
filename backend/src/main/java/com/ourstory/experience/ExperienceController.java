package com.ourstory.experience;

import com.ourstory.experience.ExperienceDtos.Experience;
import com.ourstory.experience.ExperienceDtos.WorldDetail;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/** Viewer (or admin) read API. Responses are never cacheable: they carry serverTime and time-based locks. */
@RestController
class ExperienceController {

    static final String NO_STORE = "private, no-store";

    private final ExperienceService experience;
    private final WorldViewService worlds;

    ExperienceController(ExperienceService experience, WorldViewService worlds) {
        this.experience = experience;
        this.worlds = worlds;
    }

    @GetMapping("/api/experience")
    ResponseEntity<Experience> experience(Authentication authentication) {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, NO_STORE)
                .body(experience.build(WorldAccess.isAdmin(authentication)));
    }

    @GetMapping("/api/worlds/{slug}")
    ResponseEntity<WorldDetail> world(@PathVariable String slug, Authentication authentication) {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, NO_STORE)
                .body(worlds.view(slug, WorldAccess.isAdmin(authentication)));
    }
}
