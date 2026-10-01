package com.ourstory.auth;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Admin recovery for the unlock limiter: a lockout otherwise clears by itself when the window slides. ADMIN only
 * (security chain, {@code /api/admin/**}) and CSRF-protected like every POST.
 */
@RestController
@RequestMapping("/api/admin/auth")
class AdminAuthController {

    private final UnlockRateLimiter limiter;

    AdminAuthController(UnlockRateLimiter limiter) {
        this.limiter = limiter;
    }

    @PostMapping("/reset-rate-limits")
    ResponseEntity<Void> resetRateLimits() {
        limiter.reset();
        SecurityAudit.rateLimitsReset();
        return ResponseEntity.noContent().build();
    }
}
