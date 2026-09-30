package com.ourstory.common;

import java.util.Map;
import org.springframework.http.HttpStatus;

/** Exception that maps to an RFC 7807 response with a safe, client-facing message. */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;
    private final Map<String, Object> properties;

    public ApiException(HttpStatus status, String code, String detail) {
        this(status, code, detail, Map.of());
    }

    public ApiException(HttpStatus status, String code, String detail, Map<String, Object> properties) {
        super(detail);
        this.status = status;
        this.code = code;
        this.properties = Map.copyOf(properties);
    }

    public HttpStatus status() {
        return status;
    }

    public String code() {
        return code;
    }

    public Map<String, Object> properties() {
        return properties;
    }

    public static ApiException notFound(String what) {
        return new ApiException(HttpStatus.NOT_FOUND, "not-found", what + " not found");
    }

    public static ApiException badRequest(String detail) {
        return new ApiException(HttpStatus.BAD_REQUEST, "invalid-request", detail);
    }
}
