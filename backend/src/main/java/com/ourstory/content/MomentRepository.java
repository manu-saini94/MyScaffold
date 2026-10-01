package com.ourstory.content;

import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class MomentRepository {

    private static final RowMapper<MomentWithMedia> MAPPER = MomentRepository::map;

    private final JdbcClient jdbc;

    public MomentRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Moments of a world in display order, joined with the media columns needed to render them. */
    public List<MomentWithMedia> listByWorld(String worldId) {
        return jdbc.sql("""
                SELECT m.id, m.world_id, m.media_id, m.caption, m.note, m.happened_on, m.place, m.sort_order,
                       m.is_favourite, md.mime_type, md.width, md.height, md.lqip, md.dominant_color,
                       md.taken_at
                FROM moment m JOIN media md ON md.id = m.media_id
                WHERE m.world_id = :world
                ORDER BY m.sort_order, m.id
                """).param("world", worldId).query(MAPPER).list();
    }

    /** Moment count for every world that has at least one: one grouped query, no N+1. */
    public Map<String, Integer> countsByWorld() {
        Map<String, Integer> counts = new LinkedHashMap<>();
        jdbc.sql("SELECT world_id, COUNT(*) AS n FROM moment GROUP BY world_id")
                .query((rs, i) -> counts.put(rs.getString("world_id"), rs.getInt("n"))).list();
        return Map.copyOf(counts);
    }

    /** The first {@code limit} media ids (display order) of every world, in one query. */
    public Map<String, List<String>> firstMediaIdsByWorld(int limit) {
        Map<String, List<String>> result = new LinkedHashMap<>();
        jdbc.sql("""
                SELECT world_id, media_id FROM (
                    SELECT world_id, media_id, sort_order, id,
                           ROW_NUMBER() OVER (PARTITION BY world_id ORDER BY sort_order, id) AS rn
                    FROM moment) ranked
                WHERE rn <= :limit
                ORDER BY world_id, sort_order, id
                """).param("limit", limit).query((rs, i) -> result
                        .computeIfAbsent(rs.getString("world_id"), k -> new ArrayList<>())
                        .add(rs.getString("media_id"))).list();
        Map<String, List<String>> immutable = new LinkedHashMap<>();
        result.forEach((k, v) -> immutable.put(k, List.copyOf(v)));
        return Map.copyOf(immutable);
    }

    /** The subset of the given ids that exist in the media table. */
    public Set<String> existingMediaIds(Collection<String> mediaIds) {
        if (mediaIds.isEmpty()) {
            return Set.of();
        }
        return new HashSet<>(jdbc.sql("SELECT id FROM media WHERE id IN (:ids)").param("ids", mediaIds)
                .query(String.class).list());
    }

    /**
     * Replaces every moment of the world in ONE transaction: on any failure the previous moments stay
     * untouched. sort_order follows the list order (1..n); incoming sortOrder values are ignored.
     */
    @Transactional
    public void replaceAll(String worldId, List<Moment> moments) {
        jdbc.sql("DELETE FROM moment WHERE world_id = :world").param("world", worldId).update();
        int position = 1;
        for (Moment m : moments) {
            jdbc.sql("""
                    INSERT INTO moment (id, world_id, media_id, caption, note, happened_on, place, sort_order,
                                        is_favourite)
                    VALUES (:id, :world, :media, :caption, :note, :on, :place, :sort, :fav)
                    """)
                .param("id", m.id()).param("world", worldId).param("media", m.mediaId())
                .param("caption", m.caption()).param("note", m.note())
                .param("on", m.happenedOn() == null ? null : Date.valueOf(m.happenedOn()))
                .param("place", m.place()).param("sort", position++).param("fav", m.favourite())
                .update();
        }
    }

    private static MomentWithMedia map(ResultSet rs, int row) throws SQLException {
        Date on = rs.getDate("happened_on");
        LocalDate happenedOn = on == null ? null : on.toLocalDate();
        return new MomentWithMedia(rs.getString("id"), rs.getString("world_id"), rs.getString("media_id"),
                rs.getString("caption"), rs.getString("note"), happenedOn, rs.getString("place"),
                rs.getInt("sort_order"), rs.getBoolean("is_favourite"), rs.getString("mime_type"),
                (Integer) rs.getObject("width"), (Integer) rs.getObject("height"), rs.getString("lqip"),
                rs.getString("dominant_color"), Times.read(rs, "taken_at"));
    }
}
