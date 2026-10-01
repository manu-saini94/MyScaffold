package com.ourstory.common;

import com.fasterxml.jackson.databind.exc.MismatchedInputException;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import java.io.IOException;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
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

    // --- validation: ONE error shape everywhere: 400 + errors:[{field,message}], never the rejected value ---

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        List<Map<String, String>> errors = new ArrayList<>();
        for (FieldError e : ex.getBindingResult().getFieldErrors()) {
            errors.add(fieldError(e.getField(), e.getDefaultMessage()));
        }
        ex.getBindingResult().getGlobalErrors().forEach(e -> errors.add(fieldError("body", e.getDefaultMessage())));
        return validationResponse(errors);
    }

    @Override
    protected ResponseEntity<Object> handleHandlerMethodValidationException(HandlerMethodValidationException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        List<Map<String, String>> errors = ex.getParameterValidationResults().stream()
                .flatMap(r -> r.getResolvableErrors().stream()
                        .map(e -> fieldError(String.valueOf(r.getMethodParameter().getParameterName()),
                                e.getDefaultMessage())))
                .toList();
        return validationResponse(errors);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    ResponseEntity<Object> handleConstraintViolation(ConstraintViolationException ex) {
        List<Map<String, String>> errors = ex.getConstraintViolations().stream()
                .map(ApiExceptionHandler::violation).collect(Collectors.toList());
        return validationResponse(errors);
    }

    @Override
    protected ResponseEntity<Object> handleHttpMessageNotReadable(HttpMessageNotReadableException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        if (RequestBodyTooLargeException.isCausedBy(ex)) {
            return payloadTooLarge();
        }
        if (ex.getCause() instanceof MismatchedInputException bad && !bad.getPath().isEmpty()) {
            String field = bad.getPath().stream()
                    .map(r -> r.getFieldName() != null ? r.getFieldName() : "[" + r.getIndex() + "]")
                    .collect(Collectors.joining(".")).replace(".[", "[");
            return validationResponse(List.of(fieldError(field, "Invalid value or type")));
        }
        return validationResponse(List.of(fieldError("body", "Malformed or missing JSON request body")));
    }

    private static ResponseEntity<Object> payloadTooLarge() {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.PAYLOAD_TOO_LARGE,
                "The request body is too large");
        pd.setTitle(HttpStatus.PAYLOAD_TOO_LARGE.getReasonPhrase());
        pd.setType(URI.create("urn:ourstory:problem:payload-too-large"));
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(pd);
    }

    private static Map<String, String> violation(ConstraintViolation<?> v) {
        String path = v.getPropertyPath().toString();
        String field = path.contains(".") ? path.substring(path.lastIndexOf('.') + 1) : path;
        return fieldError(field, v.getMessage());
    }

    private static Map<String, String> fieldError(String field, String message) {
        return Map.of("field", field, "message", message == null ? "invalid" : message);
    }

    private static ResponseEntity<Object> validationResponse(List<Map<String, String>> errors) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Validation failed");
        pd.setTitle(HttpStatus.BAD_REQUEST.getReasonPhrase());
        pd.setType(URI.create("urn:ourstory:problem:validation-failed"));
        pd.setProperty("errors", errors);
        return ResponseEntity.badRequest().body(pd);
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
    ResponseEntity<?> handleIo(IOException ex, HttpServletResponse response) {
        if (RequestBodyTooLargeException.isCausedBy(ex)) {
            return payloadTooLarge();
        }
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
