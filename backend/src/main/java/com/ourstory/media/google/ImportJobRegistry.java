package com.ourstory.media.google;

import com.ourstory.config.OurStoryProperties;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/**
 * Import job state lives only in the database, so progress stays readable after completion and after a
 * restart. Each item outcome is ONE atomic operation (counter increment and failure row in one
 * transaction), so a failing write can neither double count nor half count an item.
 */
@Repository
public class ImportJobRegistry {

    public static final String RUNNING = "RUNNING";
    public static final String COMPLETED = "COMPLETED";
    public static final String FAILED = "FAILED";
    public static final String TIMED_OUT_MESSAGE = "Import timed out";
    static final int MAX_FAILURES_RETURNED = 500;

    public record Failure(String filename, String outcome, String reason) {
    }

    public record JobView(String jobId, String status, int total, int done, int failed, int skipped, String error,
            OffsetDateTime startedAt, OffsetDateTime finishedAt, List<Failure> failures) {
    }

    private final JdbcClient jdbc;
    private final OurStoryProperties props;

    public ImportJobRegistry(JdbcClient jdbc, OurStoryProperties props) {
        this.jdbc = jdbc;
        this.props = props;
    }

    public void create(String jobId, String sessionId) {
        jdbc.sql("INSERT INTO import_job (id, picker_session_id, status, started_at) VALUES (:id, :sid, :st, :at)")
            .param("id", jobId).param("sid", sessionId).param("st", RUNNING).param("at", now()).update();
    }

    /** True when a job is genuinely running; jobs stuck in RUNNING past the job timeout are failed first. */
    public boolean hasRunning() {
        failStale();
        return jdbc.sql("SELECT COUNT(*) FROM import_job WHERE status = :st")
                .param("st", RUNNING).query(Long.class).single() > 0;
    }

    /** A RUNNING job older than the job timeout can only be stuck (its runner enforces the same deadline). */
    public int failStale() {
        OffsetDateTime cutoff = now().minus(props.importJob().jobTimeout());
        return jdbc.sql("""
                UPDATE import_job SET status = :failed, error = :err, finished_at = :at
                WHERE status = :running AND started_at < :cutoff
                """)
            .param("failed", FAILED).param("err", TIMED_OUT_MESSAGE).param("at", now())
            .param("running", RUNNING).param("cutoff", cutoff).update();
    }

    public void setTotal(String jobId, int total) {
        jdbc.sql("UPDATE import_job SET total = :t WHERE id = :id").param("t", total).param("id", jobId).update();
    }

    public void recordImported(String jobId) {
        jdbc.sql("UPDATE import_job SET done = done + 1 WHERE id = :id").param("id", jobId).update();
    }

    /** @param listed whether the skip is worth showing in the job report (duplicates are only counted) */
    @Transactional
    public void recordSkipped(String jobId, String googleMediaId, String filename, String reason, boolean listed) {
        jdbc.sql("UPDATE import_job SET skipped = skipped + 1 WHERE id = :id").param("id", jobId).update();
        if (listed) {
            addFailure(jobId, googleMediaId, filename, "skipped", reason);
        }
    }

    @Transactional
    public void recordFailed(String jobId, String googleMediaId, String filename, String reason) {
        jdbc.sql("UPDATE import_job SET failed = failed + 1 WHERE id = :id").param("id", jobId).update();
        addFailure(jobId, googleMediaId, filename, "failed", reason);
    }

    private void addFailure(String jobId, String googleMediaId, String filename, String outcome, String reason) {
        jdbc.sql("""
                INSERT INTO import_job_failure (job_id, google_media_id, filename, outcome, reason)
                VALUES (:job, :gid, :fn, :outcome, :reason)
                """)
            .param("job", jobId).param("gid", truncate(googleMediaId, 512)).param("fn", truncate(filename, 512))
            .param("outcome", outcome).param("reason", truncate(reason, 200)).update();
    }

    /** Only a RUNNING job can be finished, so a job already failed as stale is not overwritten. */
    public void finish(String jobId, String status, String error) {
        jdbc.sql("""
                UPDATE import_job SET status = :st, error = :err, finished_at = :at
                WHERE id = :id AND status = :running
                """)
            .param("st", status).param("err", truncate(error, 1000)).param("at", now()).param("id", jobId)
            .param("running", RUNNING).update();
    }

    /** Jobs still RUNNING at startup were killed by a restart. */
    public int failInterrupted() {
        return jdbc.sql("""
                UPDATE import_job SET status = :failed, error = :err, finished_at = :at WHERE status = :running
                """)
            .param("failed", FAILED).param("err", "Interrupted by a server restart").param("at", now())
            .param("running", RUNNING).update();
    }

    public Optional<JobView> find(String jobId) {
        List<Failure> failures = jdbc.sql("""
                SELECT filename, outcome, reason FROM import_job_failure WHERE job_id = :id
                ORDER BY id LIMIT :limit
                """)
            .param("id", jobId).param("limit", MAX_FAILURES_RETURNED)
            .query((rs, i) -> new Failure(rs.getString("filename"), rs.getString("outcome"), rs.getString("reason")))
            .list();
        return jdbc.sql("SELECT * FROM import_job WHERE id = :id").param("id", jobId)
            .query((rs, i) -> new JobView(rs.getString("id"), rs.getString("status"), rs.getInt("total"),
                    rs.getInt("done"), rs.getInt("failed"), rs.getInt("skipped"), rs.getString("error"),
                    rs.getObject("started_at", OffsetDateTime.class),
                    rs.getObject("finished_at", OffsetDateTime.class), failures))
            .optional();
    }

    private static OffsetDateTime now() {
        return OffsetDateTime.now(ZoneOffset.UTC).truncatedTo(ChronoUnit.MILLIS);
    }

    private static String truncate(String value, int max) {
        return value == null || value.length() <= max ? value : value.substring(0, max);
    }
}
