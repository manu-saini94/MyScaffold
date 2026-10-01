package com.ourstory.content;

import java.net.URI;
import java.util.List;
import java.util.Map;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Bean-validation failures of the content API as a 400 ProblemDetail with an {@code errors} list of
 * {field, message}. Rejected values are never echoed back.
 */
@RestControllerAdvice(basePackages = "com.ourstory.content")
@Order(Ordered.HIGHEST_PRECEDENCE)
class ContentExceptionAdvice {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ProblemDetail> handleValidation(MethodArgumentNotValidException ex) {
        List<Map<String, String>> errors = ex.getBindingResult().getFieldErrors().stream()
                .map(e -> Map.of("field", e.getField(),
                        "message", e.getDefaultMessage() == null ? "invalid" : e.getDefaultMessage()))
                .toList();
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Validation failed");
        pd.setTitle("Bad Request");
        pd.setType(URI.create("urn:ourstory:problem:validation-failed"));
        pd.setProperty("errors", errors);
        return ResponseEntity.badRequest().body(pd);
    }
}
