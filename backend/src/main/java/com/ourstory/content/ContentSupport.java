package com.ourstory.content;

import com.ourstory.common.ApiException;
import com.ourstory.common.UlidGenerator;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.springframework.http.HttpStatus;

/** Small helpers shared by the content services and controllers. */
final class ContentSupport {

    private ContentSupport() {
    }

    /** Current time at millisecond precision, so responses match what the database stores. */
    static Instant now() {
        return Instant.now().truncatedTo(ChronoUnit.MILLIS);
    }

    /** Path/query ids are checked before they reach the database. */
    static String requireUlid(String id, String what) {
        if (!UlidGenerator.isValid(id)) {
            throw ApiException.badRequest("Invalid " + what + " id");
        }
        return id;
    }

    /** Empty or whitespace-only optional text is stored as NULL. */
    static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }

    static ApiException unprocessable(String code, String detail) {
        return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, code, detail);
    }
}
