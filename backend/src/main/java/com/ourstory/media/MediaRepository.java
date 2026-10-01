package com.ourstory.media;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class MediaRepository {

    private static final RowMapper<MediaRecord> MAPPER = MediaRepository::map;

    private final JdbcClient jdbc;

    public MediaRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(MediaRecord m) {
        jdbc.sql("""
                INSERT INTO media (id, google_media_id, mime_type, width, height, taken_at, filename,
                                   lqip, dominant_color, imported_at)
                VALUES (:id, :gid, :mime, :w, :h, :taken, :filename, :lqip, :color, :imported)
                """)
            .param("id", m.id()).param("gid", m.googleMediaId()).param("mime", m.mimeType())
            .param("w", m.width()).param("h", m.height()).param("taken", m.takenAt())
            .param("filename", m.filename()).param("lqip", m.lqip()).param("color", m.dominantColor())
            .param("imported", m.importedAt())
            .update();
    }

    public boolean existsByGoogleMediaId(String googleMediaId) {
        return jdbc.sql("SELECT COUNT(*) FROM media WHERE google_media_id = :gid")
                .param("gid", googleMediaId).query(Long.class).single() > 0;
    }

    public boolean existsById(String id) {
        return jdbc.sql("SELECT COUNT(*) FROM media WHERE id = :id").param("id", id).query(Long.class).single() > 0;
    }

    public Optional<MediaRecord> findById(String id) {
        return jdbc.sql("SELECT * FROM media WHERE id = :id").param("id", id).query(MAPPER).optional();
    }

    /** Narrow lookup for cache validators: never loads the lqip data URI. */
    public Optional<OffsetDateTime> findImportedAt(String id) {
        return jdbc.sql("SELECT imported_at FROM media WHERE id = :id").param("id", id)
                .query((rs, i) -> rs.getObject("imported_at", OffsetDateTime.class)).optional();
    }

    /** Newest first. */
    public List<MediaRecord> findPage(int page, int size) {
        return jdbc.sql("SELECT * FROM media ORDER BY imported_at DESC, id DESC LIMIT :limit OFFSET :offset")
                .param("limit", size).param("offset", (long) page * size).query(MAPPER).list();
    }

    public long count() {
        return jdbc.sql("SELECT COUNT(*) FROM media").query(Long.class).single();
    }

    public boolean deleteById(String id) {
        return jdbc.sql("DELETE FROM media WHERE id = :id").param("id", id).update() > 0;
    }

    /** Moment media of PUBLISHED worlds that are not locked at {@code :now} (locked = unlock_at in the future). */
    private static final String OPEN_MOMENT_MEDIA = """
            SELECT m.media_id AS media_id FROM moment m JOIN world w ON w.id = m.world_id
            WHERE w.published = TRUE AND (w.unlock_at IS NULL OR w.unlock_at <= :now)
            """;

    /** Covers of PUBLISHED worlds that are not locked at {@code :now}. */
    private static final String OPEN_COVERS = """
            SELECT w.cover_media_id AS media_id FROM world w
            WHERE w.cover_media_id IS NOT NULL AND w.published = TRUE
              AND (w.unlock_at IS NULL OR w.unlock_at <= :now)
            """;

    /**
     * Viewer visibility of ONE media item: referenced by a moment of, or the cover of, a published world that
     * is not locked at {@code now}. A single EXISTS query; never loads the lqip. Evaluated on every call.
     */
    public boolean isVisibleToViewer(String id, Instant now) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM (" + OPEN_MOMENT_MEDIA + " UNION ALL " + OPEN_COVERS
                        + ") v WHERE v.media_id = :id)")
                .param("id", id).param("now", now.atOffset(ZoneOffset.UTC)).query(Boolean.class).single();
    }

    /** The subset of {@code ids} a viewer may see (same rule as {@link #isVisibleToViewer}), in one query. */
    public Set<String> findViewerVisibleIds(Collection<String> ids, Instant now) {
        if (ids.isEmpty()) {
            return Set.of();
        }
        return new HashSet<>(jdbc.sql("SELECT DISTINCT v.media_id FROM (" + OPEN_MOMENT_MEDIA + " UNION ALL "
                        + OPEN_COVERS + ") v WHERE v.media_id IN (:ids)")
                .param("ids", ids).param("now", now.atOffset(ZoneOffset.UTC)).query(String.class).list());
    }

    /** Display columns (no file info) of the existing items among {@code ids}, in one query. */
    public Map<String, MediaCard> findCards(Collection<String> ids) {
        if (ids.isEmpty()) {
            return Map.of();
        }
        Map<String, MediaCard> cards = new LinkedHashMap<>();
        jdbc.sql("SELECT id, width, height, lqip, dominant_color FROM media WHERE id IN (:ids)")
                .param("ids", ids)
                .query((rs, i) -> cards.put(rs.getString("id"), new MediaCard(rs.getString("id"),
                        (Integer) rs.getObject("width"), (Integer) rs.getObject("height"), rs.getString("lqip"),
                        rs.getString("dominant_color"))))
                .list();
        return Map.copyOf(cards);
    }

    private static MediaRecord map(ResultSet rs, int row) throws SQLException {
        return new MediaRecord(rs.getString("id"), rs.getString("google_media_id"), rs.getString("mime_type"),
                (Integer) rs.getObject("width"), (Integer) rs.getObject("height"),
                rs.getObject("taken_at", OffsetDateTime.class), rs.getString("filename"), rs.getString("lqip"),
                rs.getString("dominant_color"), rs.getObject("imported_at", OffsetDateTime.class));
    }
}
