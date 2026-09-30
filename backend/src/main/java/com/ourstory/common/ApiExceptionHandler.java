package com.ourstory.common;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URI;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/** Central RFC 7807 mapping. Never exposes stack traces, Google response bodies or internal messages. */
@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ProblemDetail> handleApi(ApiException ex) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(ex.status(), ex.getMessage());
        pd.setTitle(ex.status().getReasonPhrase());
        pd.setType(URI.create("urn:ourstory:problem:" + ex.code()));
        ex.properties().forEach(pd::setProperty);
        return ResponseEntity.status(ex.status()).body(pd);
    }

    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<ProblemDetail> handleDenied(AccessDeniedException ex) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, "Access denied");
        pd.setTitle("Forbidden");
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(pd);
    }

    /**
     * A browser that navigates away or cancels an image request aborts the connection: that is normal, so it
     * is a DEBUG line and no response body is attempted (the socket is gone). Any other IOException is a
     * real failure and takes the generic path.
     */
    @ExceptionHandler(IOException.class)
    ResponseEntity<ProblemDetail> handleIo(IOException ex, HttpServletResponse response) {
        if (isClientAbort(ex)) {
            log.debug("Client aborted the connection: {}", ex.getClass().getSimpleName());
            return null; // the HttpServletResponse parameter marks the request as handled
        }
        return handleUnexpected(ex);
    }

    static boolean isClientAbort(Throwable ex) {
        for (Throwable t = ex; t != null; t = t.getCause() == t ? null : t.getCause()) {
            String name = t.getClass().getName();
            String message = t.getMessage() == null ? "" : t.getMessage();
            if (name.endsWith("ClientAbortException") || message.contains("Broken pipe")
                    || message.contains("Connection reset") || message.contains("connection was aborted")) {
                return true;
            }
        }
        return false;
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ProblemDetail> handleUnexpected(Exception ex) {
        log.error("Unhandled exception", ex);
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR,
                "Unexpected server error");
        pd.setTitle("Internal Server Error");
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(pd);
    }
}
