package com.ourstory.content;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class LetterRepository {

    private static final RowMapper<Letter> MAPPER = LetterRepository::map;
    private static final String ORDER = " ORDER BY sort_order, id";

    private final JdbcClient jdbc;

    public LetterRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public List<Letter> findAll() {
        return jdbc.sql("SELECT * FROM letter" + ORDER).query(MAPPER).list();
    }

    public List<Letter> findByWorld(String worldId) {
        return jdbc.sql("SELECT * FROM letter WHERE world_id = :world" + ORDER).param("world", worldId)
                .query(MAPPER).list();
    }

    public Optional<Letter> findById(String id) {
        return jdbc.sql("SELECT * FROM letter WHERE id = :id").param("id", id).query(MAPPER).optional();
    }

    public int nextSortOrder() {
        return jdbc.sql("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM letter").query(Integer.class).single();
    }

    public void insert(Letter l) {
        jdbc.sql("""
                INSERT INTO letter (id, world_id, title, body, reveal_trigger, sort_order, created_at)
                VALUES (:id, :world, :title, :body, :trigger, :sort, :created)
                """)
            .param("id", l.id()).param("world", l.worldId()).param("title", l.title()).param("body", l.body())
            .param("trigger", l.revealTrigger().name()).param("sort", l.sortOrder())
            .param("created", Times.toDb(l.createdAt()))
            .update();
    }

    public boolean update(Letter l) {
        return jdbc.sql("""
                UPDATE letter SET world_id = :world, title = :title, body = :body, reveal_trigger = :trigger,
                       sort_order = :sort
                WHERE id = :id
                """)
            .param("id", l.id()).param("world", l.worldId()).param("title", l.title()).param("body", l.body())
            .param("trigger", l.revealTrigger().name()).param("sort", l.sortOrder())
            .update() > 0;
    }

    public boolean delete(String id) {
        return jdbc.sql("DELETE FROM letter WHERE id = :id").param("id", id).update() > 0;
    }

    private static Letter map(ResultSet rs, int row) throws SQLException {
        return new Letter(rs.getString("id"), rs.getString("world_id"), rs.getString("title"),
                rs.getString("body"), RevealTrigger.valueOf(rs.getString("reveal_trigger")),
                rs.getInt("sort_order"), Times.read(rs, "created_at"));
    }
}
