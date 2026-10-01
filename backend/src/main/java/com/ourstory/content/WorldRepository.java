package com.ourstory.content;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class WorldRepository {

    private static final RowMapper<World> MAPPER = WorldRepository::map;
    private static final String ORDER = " ORDER BY sort_order, id";

    private final JdbcClient jdbc;

    public WorldRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** All worlds (published or not) in display order. */
    public List<World> findAll() {
        return jdbc.sql("SELECT * FROM world" + ORDER).query(MAPPER).list();
    }

    /** Published worlds in display order: what the viewer sees. */
    public List<World> findPublished() {
        return jdbc.sql("SELECT * FROM world WHERE published = TRUE" + ORDER).query(MAPPER).list();
    }

    public Optional<World> findById(String id) {
        return jdbc.sql("SELECT * FROM world WHERE id = :id").param("id", id).query(MAPPER).optional();
    }

    public Optional<World> findBySlug(String slug) {
        return jdbc.sql("SELECT * FROM world WHERE slug = :slug").param("slug", slug).query(MAPPER).optional();
    }

    public boolean existsById(String id) {
        return jdbc.sql("SELECT COUNT(*) FROM world WHERE id = :id").param("id", id).query(Long.class).single() > 0;
    }

    /** Sort order for a new world: after every existing one. */
    public int nextSortOrder() {
        return jdbc.sql("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM world").query(Integer.class).single();
    }

    public void insert(World w) {
        jdbc.sql("""
                INSERT INTO world (id, slug, title, subtitle, tagline, layout, cover_media_id, theme_accent,
                                   sort_order, unlock_at, intro_text, outro_text, music_url, published,
                                   created_at, updated_at)
                VALUES (:id, :slug, :title, :subtitle, :tagline, :layout, :cover, :accent, :sort, :unlock,
                        :intro, :outro, :music, :published, :created, :updated)
                """)
            .param("id", w.id()).param("slug", w.slug()).param("title", w.title())
            .param("subtitle", w.subtitle()).param("tagline", w.tagline()).param("layout", w.layout().name())
            .param("cover", w.coverMediaId()).param("accent", w.themeAccent()).param("sort", w.sortOrder())
            .param("unlock", Times.toDb(w.unlockAt())).param("intro", w.introText())
            .param("outro", w.outroText()).param("music", w.musicUrl()).param("published", w.published())
            .param("created", Times.toDb(w.createdAt())).param("updated", Times.toDb(w.updatedAt()))
            .update();
    }

    /** Updates every editable column (not id, sort_order, created_at). Returns false when the id is unknown. */
    public boolean update(World w) {
        return jdbc.sql("""
                UPDATE world SET slug = :slug, title = :title, subtitle = :subtitle, tagline = :tagline,
                       layout = :layout, cover_media_id = :cover, theme_accent = :accent, unlock_at = :unlock,
                       intro_text = :intro, outro_text = :outro, music_url = :music, published = :published,
                       updated_at = :updated
                WHERE id = :id
                """)
            .param("id", w.id()).param("slug", w.slug()).param("title", w.title())
            .param("subtitle", w.subtitle()).param("tagline", w.tagline()).param("layout", w.layout().name())
            .param("cover", w.coverMediaId()).param("accent", w.themeAccent())
            .param("unlock", Times.toDb(w.unlockAt())).param("intro", w.introText())
            .param("outro", w.outroText()).param("music", w.musicUrl()).param("published", w.published())
            .param("updated", Times.toDb(w.updatedAt()))
            .update() > 0;
    }

    /** Moments and letters of the world go with it (ON DELETE CASCADE). */
    public boolean delete(String id) {
        return jdbc.sql("DELETE FROM world WHERE id = :id").param("id", id).update() > 0;
    }

    /** Sets sort_order 1..n following the list, all or nothing. */
    @Transactional
    public void reorder(List<String> orderedIds) {
        int position = 1;
        for (String id : orderedIds) {
            jdbc.sql("UPDATE world SET sort_order = :sort WHERE id = :id")
                    .param("sort", position++).param("id", id).update();
        }
    }

    private static World map(ResultSet rs, int row) throws SQLException {
        return new World(rs.getString("id"), rs.getString("slug"), rs.getString("title"),
                rs.getString("subtitle"), rs.getString("tagline"), WorldLayout.valueOf(rs.getString("layout")),
                rs.getString("cover_media_id"), rs.getString("theme_accent"), rs.getInt("sort_order"),
                Times.read(rs, "unlock_at"), rs.getString("intro_text"), rs.getString("outro_text"),
                rs.getString("music_url"), rs.getBoolean("published"), Times.read(rs, "created_at"),
                Times.read(rs, "updated_at"));
    }
}
