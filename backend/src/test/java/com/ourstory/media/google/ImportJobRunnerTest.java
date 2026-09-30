package com.ourstory.media.google;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ourstory.TestSupport;
import com.ourstory.auth.PickerTokenProvider;
import com.ourstory.common.GoogleReconnectRequiredException;
import com.ourstory.common.GoogleUpstreamException;
import com.ourstory.google.GoogleApiException;
import com.ourstory.google.PickerClient;
import com.ourstory.google.PickerModels.MediaFile;
import com.ourstory.google.PickerModels.PickedMediaItem;
import com.ourstory.google.PickerModels.PickerSession;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.Authentication;

/** Runner behaviour with every collaborator mocked: the job must ALWAYS end in a persisted state. */
class ImportJobRunnerTest {

    private static final String JOB = "01J00000000000000000000001";
    private static final String SESSION = "sess_runner1";
    private static final String FAILED = ImportJobRegistry.FAILED;

    private final PickerClient client = mock(PickerClient.class);
    private final PickerTokenProvider tokens = mock(PickerTokenProvider.class);
    private final ItemImporter importer = mock(ItemImporter.class);
    private final ImportJobRegistry registry = mock(ImportJobRegistry.class);
    private final ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor();
    private final Authentication principal = new TestingAuthenticationToken("me", "n/a");

    @AfterEach
    void shutDown() {
        pool.shutdownNow();
        Thread.interrupted();
    }

    private ImportJobRunner runner(Duration jobTimeout) {
        return new ImportJobRunner(client, tokens, importer, registry, pool,
                TestSupport.props("./data", "a@b.c", List.of("x"), 1024, 1, "https://p.example", false, jobTimeout,
                        Duration.ofMinutes(1), 0));
    }

    private ImportJobRunner runner() {
        return runner(Duration.ofMinutes(5));
    }

    private static PickedMediaItem item(String id, String url) {
        return new PickedMediaItem(id, null, "PHOTO", new MediaFile(url, "image/jpeg", id + ".jpg", null));
    }

    private void selectionReady(PickedMediaItem... items) {
        when(tokens.accessToken(any())).thenReturn("tok");
        when(client.getSession("tok", SESSION)).thenReturn(new PickerSession(SESSION, null, null, null, true));
        when(client.listAllMediaItems("tok", SESSION)).thenReturn(List.of(items));
    }

    // --- normal path and session policy ------------------------------------------------------------------

    @Test
    void completesAndDeletesTheSessionBeforePublishingTheFinalState() {
        selectionReady(item("a", "u/a"), item("b", "u/b"));
        when(importer.importItem(any(), any())).thenReturn(ItemImporter.Result.imported());

        runner().run(JOB, SESSION, principal);

        verify(registry).setTotal(JOB, 2);
        verify(registry, times(2)).recordImported(JOB);
        var order = inOrder(client, registry);
        order.verify(client).deleteSession("tok", SESSION);
        order.verify(registry).finish(JOB, ImportJobRegistry.COMPLETED, null);
    }

    @Test
    void keepsTheSessionWhenNothingWasPickedYet() {
        when(tokens.accessToken(any())).thenReturn("tok");
        when(client.getSession("tok", SESSION)).thenReturn(new PickerSession(SESSION, null, null, null, false));
        runner().run(JOB, SESSION, principal);
        verify(client, never()).deleteSession(any(), any());
        verify(client, never()).listAllMediaItems(any(), any());
        verify(registry).finish(eq(JOB), eq(FAILED), org.mockito.ArgumentMatchers.contains("no selection"));
    }

    @Test
    void keepsTheSessionOnTransientErrorsBeforeTheSelectionWasRead() {
        when(tokens.accessToken(any())).thenReturn("tok");
        when(client.getSession("tok", SESSION)).thenReturn(new PickerSession(SESSION, null, null, null, true));
        when(client.listAllMediaItems("tok", SESSION)).thenThrow(new GoogleApiException(503));
        runner().run(JOB, SESSION, principal);
        verify(client, never()).deleteSession(any(), any());
        verify(registry).finish(eq(JOB), eq(FAILED), org.mockito.ArgumentMatchers.contains("503"));
    }

    @Test
    void keepsTheSessionWhenTheTokenIsGoneAtTheStart() {
        when(tokens.accessToken(any())).thenThrow(new GoogleReconnectRequiredException());
        runner().run(JOB, SESSION, principal);
        verify(client, never()).deleteSession(any(), any());
        verify(registry).finish(JOB, FAILED, ImportJobRunner.RECONNECT_MESSAGE);
    }

    @Test
    void anUnexpectedCrashBeforeListingKeepsTheSessionAndHidesDetails() {
        when(tokens.accessToken(any())).thenReturn("tok");
        when(client.getSession(any(), any())).thenThrow(new IllegalStateException("kaboom secret"));
        runner().run(JOB, SESSION, principal);
        verify(client, never()).deleteSession(any(), any());
        verify(registry).finish(JOB, FAILED, ImportJobRunner.INTERNAL_ERROR_MESSAGE);
    }

    @Test
    void deletesTheSessionWhenTheJobFailsAfterDownloadsStarted() {
        selectionReady(item("a", "u/a"));
        when(importer.importItem(any(), any())).thenThrow(new GoogleReconnectRequiredException());
        runner().run(JOB, SESSION, principal);
        verify(client).deleteSession("tok", SESSION);
        verify(registry).finish(JOB, FAILED, ImportJobRunner.RECONNECT_MESSAGE);
    }

    @Test
    void aFailureRightAfterListingStillDeletesTheSession() {
        selectionReady(item("a", "u/a"));
        doThrow(new IllegalStateException("db down")).when(registry).setTotal(any(), org.mockito.ArgumentMatchers.anyInt());
        runner().run(JOB, SESSION, principal);
        verify(client).deleteSession("tok", SESSION);
        verify(registry).finish(JOB, FAILED, ImportJobRunner.INTERNAL_ERROR_MESSAGE);
    }

    // --- always finish -------------------------------------------------------------------------------------

    @Test
    void finishesEvenWhenAnErrorRatherThanAnExceptionEscapes() {
        when(tokens.accessToken(any())).thenReturn("tok");
        when(client.getSession(any(), any())).thenThrow(new StackOverflowError());
        runner().run(JOB, SESSION, principal);
        verify(registry).finish(JOB, FAILED, ImportJobRunner.INTERNAL_ERROR_MESSAGE);
    }

    @Test
    void neverThrowsWhenPersistingTheFinalStateFailsAndTriesTwice() {
        selectionReady(item("a", "u/a"));
        when(importer.importItem(any(), any())).thenReturn(ItemImporter.Result.imported());
        doThrow(new IllegalStateException("db down")).when(registry).finish(any(), any(), any());
        runner().run(JOB, SESSION, principal); // must not throw
        verify(registry, times(2)).finish(JOB, ImportJobRegistry.COMPLETED, null);
    }

    @Test
    void aSecondFinishAttemptSucceedsAfterATransientFailure() {
        selectionReady(item("a", "u/a"));
        when(importer.importItem(any(), any())).thenReturn(ItemImporter.Result.imported());
        doThrow(new IllegalStateException("blip")).doNothing().when(registry).finish(any(), any(), any());
        runner().run(JOB, SESSION, principal);
        verify(registry, times(2)).finish(JOB, ImportJobRegistry.COMPLETED, null);
    }

    @Test
    void sessionCleanupBlowingUpStillPublishesTheFinalState() {
        selectionReady(item("a", "u/a"));
        when(importer.importItem(any(), any())).thenReturn(ItemImporter.Result.imported());
        doThrow(new StackOverflowError()).when(client).deleteSession(any(), any());
        runner().run(JOB, SESSION, principal);
        verify(registry).finish(JOB, ImportJobRegistry.COMPLETED, null);
    }

    @Test
    void anInterruptedRunIsFailedNotCompleted() throws Exception {
        selectionReady(item("a", "u/a"));
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        when(importer.importItem(any(), any())).thenAnswer(inv -> {
            started.countDown();
            try {
                release.await(10, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            return ItemImporter.Result.imported();
        });
        Thread runThread = new Thread(() -> runner().run(JOB, SESSION, principal));
        runThread.start();
        assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
        runThread.interrupt();
        runThread.join(5000);
        assertThat(runThread.isAlive()).isFalse();
        verify(registry).finish(JOB, FAILED, ImportJobRunner.INTERRUPTED_MESSAGE);
        verify(registry, never()).finish(eq(JOB), eq(ImportJobRegistry.COMPLETED), any());
        release.countDown();
    }

    @Test
    void aJobPastItsDeadlineIsFailedAsTimedOutAndItsWorkersAreCancelled() throws Exception {
        selectionReady(item("a", "u/a"));
        CountDownLatch workerInterrupted = new CountDownLatch(1);
        when(importer.importItem(any(), any())).thenAnswer(inv -> {
            try {
                Thread.sleep(20_000);
            } catch (InterruptedException e) {
                workerInterrupted.countDown();
            }
            return ItemImporter.Result.failed("interrupted");
        });
        long start = System.nanoTime();
        runner(Duration.ofMillis(300)).run(JOB, SESSION, principal);
        assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(10));
        verify(registry).finish(JOB, FAILED, "Import timed out");
        assertThat(workerInterrupted.await(5, TimeUnit.SECONDS)).isTrue();
        // The cancelled worker must not write its outcome into the finished job.
        Thread.sleep(200);
        verify(registry, never()).recordFailed(any(), any(), any(), any());
    }

    @Test
    void theDeadlineAlsoStopsSubmittingWhenAllPermitsAreBusy() {
        PickedMediaItem[] items = new PickedMediaItem[20];
        for (int i = 0; i < items.length; i++) {
            items[i] = item("p" + i, "u/" + i);
        }
        selectionReady(items);
        when(importer.importItem(any(), any())).thenAnswer(inv -> {
            try {
                Thread.sleep(20_000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            return ItemImporter.Result.failed("interrupted");
        });
        runner(Duration.ofMillis(300)).run(JOB, SESSION, principal);
        verify(registry).finish(JOB, FAILED, "Import timed out");
        verify(importer, org.mockito.Mockito.atMost(4)).importItem(any(), any());
    }

    // --- item level ---------------------------------------------------------------------------------------------

    @Test
    void aCrashingItemIsRecordedAsFailedAndTheJobStillCompletes() {
        selectionReady(item("a", "u/a"), item("b", "u/b"));
        when(importer.importItem(eq(item("a", "u/a")), any())).thenThrow(new IllegalStateException("weird"));
        when(importer.importItem(eq(item("b", "u/b")), any())).thenReturn(ItemImporter.Result.imported());
        runner().run(JOB, SESSION, principal);
        verify(registry).recordFailed(JOB, "a", "a.jpg", "unexpected_error");
        verify(registry).recordImported(JOB);
        verify(registry).finish(JOB, ImportJobRegistry.COMPLETED, null);
    }

    @Test
    void skippedItemsAreListedOnlyWhenWorthShowing() {
        selectionReady(item("a", "u/a"), item("b", "u/b"));
        when(importer.importItem(eq(item("a", "u/a")), any())).thenReturn(ItemImporter.Result.skipped("unsupported_type"));
        when(importer.importItem(eq(item("b", "u/b")), any())).thenReturn(ItemImporter.Result.alreadyImported());
        runner().run(JOB, SESSION, principal);
        verify(registry).recordSkipped(JOB, "a", "a.jpg", "unsupported_type", true);
        verify(registry).recordSkipped(JOB, "b", "b.jpg", "already_imported", false);
    }

    @Test
    void anOutcomeThatCannotBeRecordedIsCountedAsFailedExactlyOnce() {
        selectionReady(item("a", "u/a"));
        when(importer.importItem(any(), any())).thenReturn(ItemImporter.Result.imported());
        doThrow(new IllegalStateException("db blip")).when(registry).recordImported(JOB);
        runner().run(JOB, SESSION, principal);
        verify(registry, times(1)).recordImported(JOB);
        verify(registry, times(1)).recordFailed(JOB, "a", "a.jpg", "record_error");
        verify(registry).finish(JOB, ImportJobRegistry.COMPLETED, null);
    }

    @Test
    void aFailingFallbackRecordNeitherThrowsNorRecordsTwice() {
        selectionReady(item("a", "u/a"));
        when(importer.importItem(any(), any())).thenReturn(ItemImporter.Result.failed("http_500"));
        doThrow(new IllegalStateException("db down")).when(registry).recordFailed(any(), any(), any(), any());
        runner().run(JOB, SESSION, principal);
        verify(registry, times(2)).recordFailed(any(), any(), any(), any()); // original + one fallback, no loop
        verify(registry).finish(JOB, ImportJobRegistry.COMPLETED, null);
    }

    // --- token refresh ---------------------------------------------------------------------------------------------

    private void tokensThat(java.util.function.IntFunction<String> behaviour) {
        AtomicInteger calls = new AtomicInteger();
        when(tokens.accessToken(any())).thenAnswer(inv -> behaviour.apply(calls.incrementAndGet()));
    }

    @Test
    void aTransientTokenRefreshFailureIsRetriedOnceInsideTheJob() {
        // call 1: start; call 2: first item attempt (fails); call 3: the retry (works)
        tokensThat(n -> {
            if (n == 2) {
                throw new GoogleUpstreamException("blip");
            }
            return "tok";
        });
        when(client.getSession("tok", SESSION)).thenReturn(new PickerSession(SESSION, null, null, null, true));
        when(client.listAllMediaItems("tok", SESSION)).thenReturn(List.of(item("a", "u/a")));
        when(importer.importItem(any(), any())).thenAnswer(inv -> {
            inv.<Supplier<String>>getArgument(1).get();
            return ItemImporter.Result.imported();
        });
        runner().run(JOB, SESSION, principal);
        verify(registry).recordImported(JOB);
        verify(registry).finish(JOB, ImportJobRegistry.COMPLETED, null);
    }

    @Test
    void aPersistentTokenRefreshFailureFailsTheJobWithASafeMessage() {
        tokensThat(n -> {
            if (n >= 2) {
                throw new GoogleUpstreamException("Google could not refresh the Photos access token.");
            }
            return "tok";
        });
        when(client.getSession("tok", SESSION)).thenReturn(new PickerSession(SESSION, null, null, null, true));
        when(client.listAllMediaItems("tok", SESSION)).thenReturn(List.of(item("a", "u/a")));
        when(importer.importItem(any(), any())).thenAnswer(inv -> {
            inv.<Supplier<String>>getArgument(1).get();
            return ItemImporter.Result.imported();
        });
        runner().run(JOB, SESSION, principal);
        verify(registry).finish(JOB, FAILED, "Google could not refresh the Photos access token.");
        verify(registry, never()).recordImported(any());
    }

    // --- expired baseUrls ---------------------------------------------------------------------------------------------

    @Test
    void expiredLinksRelistTheSessionOnceAndRetryEachItemWithTheFreshUrl() {
        when(tokens.accessToken(any())).thenReturn("tok");
        when(client.getSession("tok", SESSION)).thenReturn(new PickerSession(SESSION, null, null, null, true));
        List<PickedMediaItem> stale = List.of(item("a", "https://old/a"), item("b", "https://old/b"),
                item("c", "https://old/c"));
        List<PickedMediaItem> fresh = List.of(item("a", "https://new/a"), item("b", "https://new/b"),
                item("c", "https://new/c"));
        when(client.listAllMediaItems("tok", SESSION)).thenReturn(stale).thenReturn(fresh);
        when(importer.importItem(any(), any())).thenAnswer(inv -> {
            PickedMediaItem given = inv.getArgument(0);
            return given.mediaFile().baseUrl().startsWith("https://old")
                    ? ItemImporter.Result.failed("http_403") : ItemImporter.Result.imported();
        });
        runner().run(JOB, SESSION, principal);
        verify(client, times(2)).listAllMediaItems("tok", SESSION); // the initial listing plus ONE refresh
        verify(registry, times(3)).recordImported(JOB);
        verify(registry, never()).recordFailed(any(), any(), any(), any());
        verify(registry).finish(JOB, ImportJobRegistry.COMPLETED, null);
    }

    @Test
    void aLinkThatStaysExpiredIsRecordedWithTheClearMessageAndNeverLoops() {
        when(tokens.accessToken(any())).thenReturn("tok");
        when(client.getSession("tok", SESSION)).thenReturn(new PickerSession(SESSION, null, null, null, true));
        List<PickedMediaItem> items = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            items.add(item("p" + i, "https://old/" + i));
        }
        when(client.listAllMediaItems("tok", SESSION)).thenReturn(items); // the refresh returns the same links
        when(importer.importItem(any(), any())).thenReturn(ItemImporter.Result.failed("http_404"));
        runner().run(JOB, SESSION, principal);

        verify(client, times(2)).listAllMediaItems("tok", SESSION);
        ArgumentCaptor<String> reason = ArgumentCaptor.forClass(String.class);
        verify(registry, times(5)).recordFailed(eq(JOB), anyString(), anyString(), reason.capture());
        assertThat(reason.getAllValues()).allSatisfy(r -> assertThat(r)
                .startsWith("baseurl_expired").contains("Google download link expired — run the import again"));
        verify(importer, times(5)).importItem(any(), any()); // no second attempt when the URL did not change
    }

    @Test
    void aFreshUrlThatIsStillRejectedIsAlsoBaseurlExpired() {
        when(tokens.accessToken(any())).thenReturn("tok");
        when(client.getSession("tok", SESSION)).thenReturn(new PickerSession(SESSION, null, null, null, true));
        when(client.listAllMediaItems("tok", SESSION))
                .thenReturn(List.of(item("a", "https://old/a"))).thenReturn(List.of(item("a", "https://new/a")));
        when(importer.importItem(any(), any())).thenReturn(ItemImporter.Result.failed("http_403"));
        runner().run(JOB, SESSION, principal);
        verify(importer, times(2)).importItem(any(), any());
        verify(registry).recordFailed(eq(JOB), eq("a"), eq("a.jpg"), org.mockito.ArgumentMatchers.startsWith("baseurl_expired"));
    }

    @Test
    void aFailedRefreshLeavesTheItemBaseurlExpiredWithoutCrashing() {
        when(tokens.accessToken(any())).thenReturn("tok");
        when(client.getSession("tok", SESSION)).thenReturn(new PickerSession(SESSION, null, null, null, true));
        when(client.listAllMediaItems("tok", SESSION))
                .thenReturn(List.of(item("a", "https://old/a"))).thenThrow(new GoogleApiException(500));
        when(importer.importItem(any(), any())).thenReturn(ItemImporter.Result.failed("http_403"));
        runner().run(JOB, SESSION, principal);
        verify(registry).recordFailed(eq(JOB), eq("a"), eq("a.jpg"), org.mockito.ArgumentMatchers.startsWith("baseurl_expired"));
        verify(registry).finish(JOB, ImportJobRegistry.COMPLETED, null);
    }

    @Test
    void aReconnectDuringTheRefreshAbortsTheJob() {
        when(tokens.accessToken(any())).thenReturn("tok");
        when(client.getSession("tok", SESSION)).thenReturn(new PickerSession(SESSION, null, null, null, true));
        when(client.listAllMediaItems("tok", SESSION))
                .thenReturn(List.of(item("a", "https://old/a"))).thenThrow(new GoogleReconnectRequiredException());
        when(importer.importItem(any(), any())).thenReturn(ItemImporter.Result.failed("http_403"));
        runner().run(JOB, SESSION, principal);
        verify(registry).finish(JOB, FAILED, ImportJobRunner.RECONNECT_MESSAGE);
        verify(registry, never()).recordFailed(any(), any(), any(), isNull());
    }
}
