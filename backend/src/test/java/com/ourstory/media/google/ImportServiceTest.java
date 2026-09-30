package com.ourstory.media.google;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.ourstory.auth.PickerTokenProvider;
import com.ourstory.common.ApiException;
import com.ourstory.common.UlidGenerator;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.RejectedExecutionException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.Authentication;

class ImportServiceTest {

    private final ImportJobRegistry registry = mock(ImportJobRegistry.class);
    private final ImportJobRunner runner = mock(ImportJobRunner.class);
    private final PickerTokenProvider tokens = mock(PickerTokenProvider.class);
    private final ExecutorService executor = mock(ExecutorService.class);
    private final UlidGenerator ulids = new UlidGenerator();
    private final Authentication principal = new TestingAuthenticationToken("me", "n/a");
    private final ImportService service = new ImportService(registry, runner, tokens, ulids, executor);

    @Test
    void failsTheJobAndReportsWhenTheExecutorRejectsIt() {
        doThrow(new RejectedExecutionException("shut down")).when(executor).execute(any());
        assertThatThrownBy(() -> service.start("sess_abc123", principal))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.status()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
                    assertThat(e.getMessage()).doesNotContain("shut down");
                });
        verify(registry).create(any(), org.mockito.ArgumentMatchers.eq("sess_abc123"));
        verify(registry).finish(any(), org.mockito.ArgumentMatchers.eq(ImportJobRegistry.FAILED),
                org.mockito.ArgumentMatchers.contains("could not be started"));
    }

    @Test
    void stillReportsWhenMarkingTheJobFailedAlsoFails() {
        doThrow(new RejectedExecutionException()).when(executor).execute(any());
        doThrow(new IllegalStateException("db down")).when(registry).finish(any(), any(), any());
        assertThatThrownBy(() -> service.start("sess_abc123", principal))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.status()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE));
    }

    @Test
    void refusesASecondRunningJobWithoutCreatingAnything() {
        when(registry.hasRunning()).thenReturn(true);
        assertThatThrownBy(() -> service.start("sess_abc123", principal))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.status()).isEqualTo(HttpStatus.CONFLICT));
        verify(registry, never()).create(any(), any());
    }

    @Test
    void startsTheRunnerOnTheExecutor() {
        String jobId = service.start("sess_abc123", principal);
        assertThat(UlidGenerator.isValid(jobId)).isTrue();
        verify(executor).execute(any());
    }
}
