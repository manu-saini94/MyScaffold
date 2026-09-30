package com.ourstory.auth;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
class AdminMeController {

    private final PickerTokenProvider tokens;

    AdminMeController(PickerTokenProvider tokens) {
        this.tokens = tokens;
    }

    record MeResponse(String email, String name, boolean admin, boolean pickerConnected) {
    }

    /** Access is limited to ROLE_ADMIN by the security chain, so admin is always true here. */
    @GetMapping("/api/admin/me")
    MeResponse me(@AuthenticationPrincipal OidcUser user, Authentication authentication) {
        return new MeResponse(user.getEmail(), user.getFullName(), true, tokens.isConnected(authentication));
    }
}
