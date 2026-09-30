package com.ourstory.media.google;

import com.ourstory.auth.PickerTokenProvider;
import com.ourstory.common.ApiException;
import com.ourstory.common.GoogleReconnectRequiredException;
import com.ourstory.common.GoogleUpstreamException;
import com.ourstory.config.OurStoryProperties;
import com.ourstory.google.PickerClient;
import com.ourstory.google.PickerModels.PickedMediaItem;
import com.ourstory.google.PickerModels.PickerSession;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CancellationException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

/**
 * Executes one import job: list picked items, import them with bounded concurrency, and ALWAYS end in a
 * persisted COMPLETED or FAILED state (including crashes, interrupts, timeouts and a failing final write).
 *
 * <p>The Picker session is deleted only once the selection was read and items were processed; when the job
 * fails before that (nothing picked yet, transient Google error) the session is kept so the user can retry
 * until it expires.
 */
@Component
class ImportJobRunner {

    private static final Logger log = LoggerFactory.getLogger(ImportJobRunner.class);
    static final String RECONNECT_MESSAGE =
            "Google access expired or was revoked during the import. Reconnect Google Photos and start again.";
    static final String NO_SELECTION_MESSAGE =
            "The Picker session has no selection yet (finish picking photos first).";
    static final String INTERRUPTED_MESSAGE = "Import interrupted";
    static final String INTERNAL_ERROR_MESSAGE = "Internal error during import";
    static final String BASEURL_EXPIRED_REASON =
            "baseurl_expired: Google download link expired — run the import again";

    /** How the item loop ended. */
    private enum Ending { DONE, INTERRUPTED, TIMED_OUT }

    /** Final state of a job plus whether the Picker session should be deleted. */
    record Outcome(String status, String error, boolean deleteSession) {
        static Outcome completed() {
            return new Outcome(ImportJobRegistry.COMPLETED, null, true);
        }

        static Outcome failed(String error, boolean deleteSession) {
            return new Outcome(ImportJobRegistry.FAILED, error, deleteSession);
        }
    }

    /** Everything one running job shares between its worker tasks. */
    private record JobContext(String jobId, Supplier<String> token, FreshLinks links, AtomicReference<String> abort,
            AtomicBoolean cancelled) {
        boolean aborted() {
            return abort.get() != null;
        }
    }

    private final PickerClient client;
    private final PickerTokenProvider tokens;
    private final ItemImporter importer;
    private final ImportJobRegistry registry;
    private final ExecutorService workers;
    private final int concurrency;
    private final long jobTimeoutNanos;
    private final long tokenRetryMillis;

    ImportJobRunner(PickerClient client, PickerTokenProvider tokens, ItemImporter importer,
            ImportJobRegistry registry, ExecutorService importExecutor, OurStoryProperties props) {
        this.client = client;
        this.tokens = tokens;
        this.importer = importer;
        this.registry = registry;
        this.workers = importExecutor;
        this.concurrency = props.importJob().concurrency();
        this.jobTimeoutNanos = props.importJob().jobTimeout().toNanos();
        this.tokenRetryMillis = props.importJob().backoffBaseMillis();
    }

    /** Never throws: every outcome ends in a persisted COMPLETED or FAILED state. */
    void run(String jobId, String sessionId, Authentication principal) {
        Outcome outcome = Outcome.failed(INTERNAL_ERROR_MESSAGE, false);
        try {
            outcome = execute(jobId, sessionId, principal);
        } catch (Throwable t) { // the job must still be finished, whatever went wrong
            outcome = classify(jobId, t, false);
        } finally {
            finish(jobId, sessionId, principal, outcome);
        }
    }

    private Outcome execute(String jobId, String sessionId, Authentication principal) {
        Supplier<String> token = () -> freshToken(principal);
        List<PickedMediaItem> items;
        try {
            String accessToken = token.get();
            PickerSession session = client.getSession(accessToken, sessionId);
            if (session == null || !session.mediaItemsSet()) {
                return Outcome.failed(NO_SELECTION_MESSAGE, false);
            }
            items = client.listAllMediaItems(accessToken, sessionId);
        } catch (Throwable t) { // nothing was downloaded yet: keep the session for a retry
            return classify(jobId, t, false);
        }
        try {
            registry.setTotal(jobId, items.size());
            return importAll(items, new JobContext(jobId, token, new FreshLinks(client, token, sessionId),
                    new AtomicReference<>(), new AtomicBoolean()));
        } catch (Throwable t) {
            return classify(jobId, t, true);
        }
    }

    private Outcome importAll(List<PickedMediaItem> items, JobContext ctx) {
        long deadline = System.nanoTime() + jobTimeoutNanos;
        Semaphore permits = new Semaphore(concurrency);
        List<Future<?>> pending = new ArrayList<>();
        Ending ending = Ending.DONE;
        for (PickedMediaItem item : items) {
            if (ctx.aborted()) {
                break;
            }
            ending = acquire(permits, deadline);
            if (ending != Ending.DONE) {
                break;
            }
            pending.add(workers.submit(() -> {
                try {
                    processItem(ctx, item);
                } finally {
                    permits.release();
                }
            }));
        }
        if (ending == Ending.DONE) {
            ending = awaitAll(pending, deadline);
        }
        if (ending != Ending.DONE) {
            ctx.cancelled().set(true); // workers must not write into a job that is already finished
            pending.forEach(future -> future.cancel(true));
        }
        return outcomeOf(ending, ctx);
    }

    private static Outcome outcomeOf(Ending ending, JobContext ctx) {
        if (ctx.aborted()) {
            return Outcome.failed(ctx.abort().get(), true);
        }
        return switch (ending) {
            case DONE -> Outcome.completed();
            case INTERRUPTED -> Outcome.failed(INTERRUPTED_MESSAGE, true);
            case TIMED_OUT -> Outcome.failed(ImportJobRegistry.TIMED_OUT_MESSAGE, true);
        };
    }

    private void processItem(JobContext ctx, PickedMediaItem item) {
        if (ctx.aborted()) {
            return;
        }
        ItemImporter.Result result;
        try {
            result = importWithFreshLinks(ctx, item);
        } catch (GoogleReconnectRequiredException e) {
            ctx.abort().compareAndSet(null, RECONNECT_MESSAGE);
            return;
        } catch (GoogleUpstreamException e) {
            ctx.abort().compareAndSet(null, e.getMessage());
            return;
        } catch (RuntimeException e) {
            log.warn("Item processing failed: {}", e.getClass().getSimpleName());
            result = ItemImporter.Result.failed("unexpected_error");
        }
        if (ctx.cancelled().get() || Thread.currentThread().isInterrupted()) {
            return;
        }
        record(ctx.jobId(), item, result);
    }

    /** On 403/404 the baseUrl probably expired: refresh the links once per job and retry the item once. */
    private ItemImporter.Result importWithFreshLinks(JobContext ctx, PickedMediaItem item) {
        PickedMediaItem current = ctx.links().latest(item);
        ItemImporter.Result result = importer.importItem(current, ctx.token());
        if (!isExpiredLink(result)) {
            return result;
        }
        ctx.links().refreshOnce();
        PickedMediaItem updated = ctx.links().latest(item);
        if (sameLink(updated, current)) {
            return ItemImporter.Result.failed(BASEURL_EXPIRED_REASON);
        }
        result = importer.importItem(updated, ctx.token());
        return isExpiredLink(result) ? ItemImporter.Result.failed(BASEURL_EXPIRED_REASON) : result;
    }

    private static boolean isExpiredLink(ItemImporter.Result result) {
        return result.kind() == ItemImporter.Kind.FAILED
                && ("http_403".equals(result.reason()) || "http_404".equals(result.reason()));
    }

    private static boolean sameLink(PickedMediaItem a, PickedMediaItem b) {
        String first = a.mediaFile() == null ? null : a.mediaFile().baseUrl();
        String second = b.mediaFile() == null ? null : b.mediaFile().baseUrl();
        return first == null ? second == null : first.equals(second);
    }

    /**
     * Records the item outcome atomically. If even that fails, the item is counted as failed exactly once
     * (the failed attempt was rolled back, so nothing is counted twice or not at all).
     */
    private void record(String jobId, PickedMediaItem item, ItemImporter.Result result) {
        String filename = item == null || item.mediaFile() == null ? null : item.mediaFile().filename();
        String googleId = item == null ? null : item.id();
        try {
            switch (result.kind()) {
                case IMPORTED -> registry.recordImported(jobId);
                case SKIPPED -> registry.recordSkipped(jobId, googleId, filename, result.reason(), result.record());
                case FAILED -> registry.recordFailed(jobId, googleId, filename, result.reason());
            }
        } catch (RuntimeException e) {
            log.error("Could not record an item outcome ({}); counting it as failed", e.getClass().getSimpleName());
            try {
                registry.recordFailed(jobId, googleId, filename, "record_error");
            } catch (RuntimeException again) {
                log.error("Could not record the fallback outcome either: {}", again.getClass().getSimpleName());
            }
        }
    }

    /** A transient refresh failure is retried once; reconnect-required is never retried. */
    private String freshToken(Authentication principal) {
        try {
            return tokens.accessToken(principal);
        } catch (GoogleUpstreamException first) {
            pauseBriefly();
            return tokens.accessToken(principal);
        }
    }

    private void pauseBriefly() {
        try {
            Thread.sleep(tokenRetryMillis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private Outcome classify(String jobId, Throwable t, boolean deleteSession) {
        if (t instanceof GoogleReconnectRequiredException) {
            return Outcome.failed(RECONNECT_MESSAGE, deleteSession);
        }
        if (t instanceof ApiException api) {
            return Outcome.failed(api.getMessage(), deleteSession);
        }
        log.error("Import job {} crashed", jobId, t);
        return Outcome.failed(INTERNAL_ERROR_MESSAGE, deleteSession);
    }

    /** Session cleanup, then the final state; the state is written even if cleanup blows up. */
    private void finish(String jobId, String sessionId, Authentication principal, Outcome outcome) {
        boolean interrupted = Thread.interrupted(); // JDBC and HTTP need a clear flag; restored below
        try {
            if (outcome.deleteSession()) {
                deleteSessionQuietly(sessionId, principal);
            }
        } catch (Throwable t) {
            log.warn("Picker session cleanup failed: {}", t.getClass().getSimpleName());
        } finally {
            persistFinalState(jobId, outcome);
            if (interrupted) {
                Thread.currentThread().interrupt();
            }
        }
    }

    private void persistFinalState(String jobId, Outcome outcome) {
        for (int attempt = 1; attempt <= 2; attempt++) {
            try {
                registry.finish(jobId, outcome.status(), outcome.error());
                return;
            } catch (Throwable t) {
                log.error("Could not persist the final state of import job {} (attempt {}): {}", jobId, attempt,
                        t.getClass().getSimpleName());
            }
        }
    }

    private void deleteSessionQuietly(String sessionId, Authentication principal) {
        try {
            client.deleteSession(tokens.accessToken(principal), sessionId);
        } catch (RuntimeException e) {
            log.info("Picker session cleanup skipped: {}", e.getClass().getSimpleName());
        }
    }

    private static Ending acquire(Semaphore permits, long deadlineNanos) {
        try {
            long remaining = Math.max(deadlineNanos - System.nanoTime(), 0);
            return permits.tryAcquire(remaining, TimeUnit.NANOSECONDS) ? Ending.DONE : Ending.TIMED_OUT;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Ending.INTERRUPTED;
        }
    }

    private static Ending awaitAll(List<Future<?>> futures, long deadlineNanos) {
        for (Future<?> future : futures) {
            try {
                future.get(Math.max(deadlineNanos - System.nanoTime(), 0), TimeUnit.NANOSECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return Ending.INTERRUPTED;
            } catch (TimeoutException e) {
                return Ending.TIMED_OUT;
            } catch (ExecutionException e) {
                log.warn("Import worker ended abnormally: {}", e.getCause().getClass().getSimpleName());
            } catch (CancellationException e) {
                log.debug("Import worker was cancelled");
            }
        }
        return Ending.DONE;
    }
}
