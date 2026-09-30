package com.ourstory.media.google;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.ourstory.common.UlidGenerator;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;

/** Real H2 + Flyway: stuck-job handling and atomic outcome recording. */
@SpringBootTest(properties = {
        "ourstory.import-job.job-timeout=1h",
        "spring.datasource.url=jdbc:h2:mem:ourstory-registry-test;DB_CLOSE_DELAY=-1"})
@ActiveProfiles("test")
class ImportJobRegistryTest {

    @Autowired ImportJobRegistry registry;
    @Autowired JdbcClient jdbc;
    @Autowired UlidGenerator ulids;

    @AfterEach
    void cleanUp() {
        jdbc.sql("DELETE FROM import_job").update();
    }

    private String job() {
        String id = ulids.next();
        registry.create(id, "sess_registry");
        return id;
    }

    private void backdate(String jobId, long hours) {
        jdbc.sql("UPDATE import_job SET started_at = :at WHERE id = :id")
                .param("at", OffsetDateTime.now(ZoneOffset.UTC).minusHours(hours)).param("id", jobId).update();
    }

    @Test
    void aRunningJobPastTheTimeoutIsFailedAndNoLongerBlocksNewImports() {
        String stuck = job();
        backdate(stuck, 2);
        assertThat(registry.hasRunning()).isFalse();
        var view = registry.find(stuck).orElseThrow();
        assertThat(view.status()).isEqualTo(ImportJobRegistry.FAILED);
        assertThat(view.error()).isEqualTo("Import timed out");
        assertThat(view.finishedAt()).isNotNull();
    }

    @Test
    void aFreshRunningJobStillBlocks() {
        job();
        assertThat(registry.hasRunning()).isTrue();
        assertThat(registry.failStale()).isZero();
    }

    @Test
    void aFinishedJobIsNotOverwrittenByALateFinish() {
        String id = job();
        backdate(id, 3);
        registry.failStale();
        registry.finish(id, ImportJobRegistry.COMPLETED, null); // the (dead) runner wakes up late
        assertThat(registry.find(id).orElseThrow().status()).isEqualTo(ImportJobRegistry.FAILED);
    }

    @Test
    void recordsEachOutcomeKindOnce() {
        String id = job();
        registry.recordImported(id);
        registry.recordSkipped(id, "g1", "a.jpg", "unsupported_type", true);
        registry.recordSkipped(id, "g2", "b.jpg", "already_imported", false);
        registry.recordFailed(id, "g3", "c.jpg", "http_404");
        var view = registry.find(id).orElseThrow();
        assertThat(view.done()).isEqualTo(1);
        assertThat(view.skipped()).isEqualTo(2);
        assertThat(view.failed()).isEqualTo(1);
        assertThat(view.failures()).extracting(ImportJobRegistry.Failure::reason)
                .containsExactly("unsupported_type", "http_404");
    }

    @Test
    void aFailingFailureRowRollsTheCounterBackSoNothingIsCountedTwiceOrHalf() {
        String id = job();
        // reason is NOT NULL in the schema, so the failure insert fails after the counter update.
        assertThatThrownBy(() -> registry.recordFailed(id, "g", "f.jpg", null)).isInstanceOf(RuntimeException.class);
        assertThat(registry.find(id).orElseThrow().failed()).isZero();
        assertThatThrownBy(() -> registry.recordSkipped(id, "g", "f.jpg", null, true))
                .isInstanceOf(RuntimeException.class);
        assertThat(registry.find(id).orElseThrow().skipped()).isZero();
    }
}
