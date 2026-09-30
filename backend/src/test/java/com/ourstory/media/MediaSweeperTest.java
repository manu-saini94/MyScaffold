package com.ourstory.media;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.time.Instant;
import java.util.function.Predicate;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class MediaSweeperTest {

    private final MediaStorage storage = mock(MediaStorage.class);
    private final MediaRepository repository = mock(MediaRepository.class);
    private final MediaSweeper sweeper = new MediaSweeper(storage, repository);

    @Test
    void asksTheStorageToSweepDirectoriesOlderThanAnHourUsingTheDatabaseAsTruth() {
        Instant now = Instant.parse("2026-10-01T12:00:00Z");
        when(storage.sweep(any(), any())).thenReturn(new MediaStorage.SweepResult(2, 1));
        when(repository.existsById("has-row")).thenReturn(true);

        assertThat(sweeper.sweep(now)).isEqualTo(new MediaStorage.SweepResult(2, 1));

        ArgumentCaptor<Predicate<String>> hasRow = ArgumentCaptor.forClass(Predicate.class);
        ArgumentCaptor<Instant> cutoff = ArgumentCaptor.forClass(Instant.class);
        verify(storage).sweep(hasRow.capture(), cutoff.capture());
        assertThat(cutoff.getValue()).isEqualTo(now.minus(Duration.ofHours(1)));
        assertThat(hasRow.getValue().test("has-row")).isTrue();
        assertThat(hasRow.getValue().test("no-row")).isFalse();
    }

    @Test
    void aFailingSweepNeverBlocksStartup() {
        when(storage.sweep(any(), any())).thenThrow(new IllegalStateException("disk gone"));
        assertThat(sweeper.sweep(Instant.now())).isEqualTo(new MediaStorage.SweepResult(0, 0));
        sweeper.sweepOnStartup(); // also fine, the listener swallows the failure
    }

    @Test
    void nothingToSweepIsQuiet() {
        when(storage.sweep(any(), any())).thenReturn(new MediaStorage.SweepResult(0, 0));
        assertThat(sweeper.sweep(Instant.now()).orphanDirectories()).isZero();
    }
}
