package com.ourstory.experience;

import com.ourstory.auth.AdminGuard;
import com.ourstory.content.World;
import java.time.Instant;
import org.springframework.security.core.Authentication;

/** Who is asking and whether a world is open to them right now. */
final class WorldAccess {

    private WorldAccess() {
    }

    static boolean isAdmin(Authentication authentication) {
        return authentication != null && authentication.isAuthenticated()
                && authentication.getAuthorities().stream()
                        .anyMatch(a -> AdminGuard.ROLE_ADMIN.equals(a.getAuthority()));
    }

    /** Locked while {@code now} is before unlock_at; the exact unlock instant is already open. */
    static boolean isTimeLocked(World world, Instant now) {
        return world.unlockAt() != null && now.isBefore(world.unlockAt());
    }
}
