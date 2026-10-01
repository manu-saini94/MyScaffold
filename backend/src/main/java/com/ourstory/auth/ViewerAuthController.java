package com.ourstory.auth;

import com.ourstory.common.ApiException;
import com.ourstory.settings.SettingsService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.net.URI;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** The public unlock surface. CSRF applies to both POSTs: GET /question (or /status) issues the token. */
@RestController
@RequestMapping("/api/auth")
class ViewerAuthController {

    record QuestionResponse(String question) { }

    record StatusResponse(boolean unlocked) { }

    record UnlockRequest(@NotBlank @Size(max = AnswerNormalizer.MAX_LENGTH) String answer) { }

    private final SettingsService settings;
    private final UnlockService unlock;
    private final ViewerCookies cookies;

    ViewerAuthController(SettingsService settings, UnlockService unlock, ViewerCookies cookies) {
        this.settings = settings;
        this.unlock = unlock;
        this.cookies = cookies;
    }

    @GetMapping("/question")
    QuestionResponse question() {
        return settings.unlockQuestion()
                .filter(q -> settings.unlockConfigured())
                .map(QuestionResponse::new)
                .orElseThrow(ViewerAuthController::notConfigured);
    }

    @GetMapping("/status")
    StatusResponse status() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        boolean unlocked = auth != null && auth.isAuthenticated() && auth.getAuthorities().stream()
                .anyMatch(a -> ViewerAuthentication.ROLE_VIEWER.equals(a.getAuthority())
                        || AdminGuard.ROLE_ADMIN.equals(a.getAuthority()));
        return new StatusResponse(unlocked);
    }

    @PostMapping("/unlock")
    ResponseEntity<?> unlock(@Valid @RequestBody UnlockRequest body, HttpServletRequest request) {
        UnlockService.Outcome outcome = unlock.attempt(request.getRemoteAddr(), body.answer());
        return switch (outcome) {
            case UnlockService.Outcome.Success s -> ResponseEntity.noContent()
                    .header(HttpHeaders.SET_COOKIE, cookies.issueHeader()).build();
            case UnlockService.Outcome.Failure f -> failure(f.attemptsRemaining());
            case UnlockService.Outcome.RateLimited r -> rateLimited(r.retryAfter().toSeconds());
            case UnlockService.Outcome.NotConfigured n -> throw notConfigured();
        };
    }

    @PostMapping("/lock")
    ResponseEntity<Void> lock() {
        return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE, cookies.clearHeader()).build();
    }

    private static ResponseEntity<ProblemDetail> failure(int attemptsRemaining) {
        ProblemDetail pd = problem(HttpStatus.UNAUTHORIZED, "unlock-failed", "That is not the right answer.");
        pd.setProperty("attemptsRemaining", attemptsRemaining);
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(pd);
    }

    private static ResponseEntity<ProblemDetail> rateLimited(long retryAfterSeconds) {
        ProblemDetail pd = problem(HttpStatus.TOO_MANY_REQUESTS, "too-many-attempts",
                "Too many attempts. Please try again later.");
        pd.setProperty("retryAfterSeconds", retryAfterSeconds);
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header(HttpHeaders.RETRY_AFTER, Long.toString(retryAfterSeconds)).body(pd);
    }

    private static ProblemDetail problem(HttpStatus status, String code, String detail) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(status, detail);
        pd.setTitle(status.getReasonPhrase());
        pd.setType(URI.create("urn:ourstory:problem:" + code));
        return pd;
    }

    private static ApiException notConfigured() {
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "unlock-not-configured",
                "Unlocking is not available right now.");
    }
}
