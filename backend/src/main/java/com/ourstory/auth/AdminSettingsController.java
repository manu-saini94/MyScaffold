package com.ourstory.auth;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** /api/admin/settings: ADMIN only (security chain) and CSRF-protected for PUT/POST. */
@RestController
@RequestMapping("/api/admin/settings")
class AdminSettingsController {

    private final AdminSettingsService service;

    AdminSettingsController(AdminSettingsService service) {
        this.service = service;
    }

    @GetMapping
    Map<String, Object> get() {
        return service.view();
    }

    @PutMapping
    Map<String, Object> put(@RequestBody Map<String, JsonNode> changes) {
        return service.update(changes);
    }

    @PostMapping("/sign-out-everyone")
    ResponseEntity<Void> signOutEveryone() {
        service.signOutEveryone();
        return ResponseEntity.noContent().build();
    }
}
