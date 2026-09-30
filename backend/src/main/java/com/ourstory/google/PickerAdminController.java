package com.ourstory.google;

import com.ourstory.google.PickerSessionService.CreatedSession;
import com.ourstory.google.PickerSessionService.SessionStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/picker/sessions")
class PickerAdminController {

    private final PickerSessionService sessions;

    PickerAdminController(PickerSessionService sessions) {
        this.sessions = sessions;
    }

    record CreateRequest(Integer maxItemCount) {
    }

    @PostMapping
    CreatedSession create(Authentication authentication, @RequestBody(required = false) CreateRequest body) {
        return sessions.create(authentication, body == null ? null : body.maxItemCount());
    }

    @GetMapping("/{id}")
    SessionStatus status(Authentication authentication, @PathVariable String id) {
        return sessions.status(authentication, id);
    }
}
