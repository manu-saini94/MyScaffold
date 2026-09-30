package com.ourstory.media.google;

import com.ourstory.auth.PickerTokenProvider;
import com.ourstory.common.ApiException;
import com.ourstory.common.UlidGenerator;
import com.ourstory.google.PickerSessionService;
import java.util.concurrent.ExecutorService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

@Service
public class ImportService {

    private static final Logger log = LoggerFactory.getLogger(ImportService.class);

    private final ImportJobRegistry registry;
    private final ImportJobRunner runner;
    private final PickerTokenProvider tokens;
    private final UlidGenerator ulids;
    private final ExecutorService executor;

    ImportService(ImportJobRegistry registry, ImportJobRunner runner, PickerTokenProvider tokens,
            UlidGenerator ulids, ExecutorService importExecutor) {
        this.registry = registry;
        this.runner = runner;
        this.tokens = tokens;
        this.ulids = ulids;
        this.executor = importExecutor;
    }

    /** Starts the job on a virtual thread and returns its id immediately. */
    public synchronized String start(String sessionId, Authentication principal) {
        PickerSessionService.requireValidId(sessionId);
        tokens.accessToken(principal); // fail fast with 409 + authorizeUrl instead of a doomed job
        if (registry.hasRunning()) {
            throw new ApiException(HttpStatus.CONFLICT, "import-already-running",
                    "Another import is still running. Wait for it to finish.");
        }
        String jobId = ulids.next();
        registry.create(jobId, sessionId);
        try {
            executor.execute(() -> runner.run(jobId, sessionId, principal));
        } catch (RuntimeException e) {
            // The job row exists but nothing will ever run it: fail it now instead of leaving it RUNNING.
            log.error("Could not start import job {}", jobId, e);
            markNotStarted(jobId);
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "import-not-started",
                    "The import could not be started. Try again.");
        }
        return jobId;
    }

    private void markNotStarted(String jobId) {
        try {
            registry.finish(jobId, ImportJobRegistry.FAILED, "Import could not be started");
        } catch (RuntimeException e) {
            log.error("Could not mark import job {} as failed: {}", jobId, e.getClass().getSimpleName());
        }
    }
}
