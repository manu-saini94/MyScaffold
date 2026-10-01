package com.ourstory.settings;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Plain key/value access to the settings table. No validation here; see {@link SettingsService}. */
@Repository
public class SettingsRepository {

    private final JdbcClient jdbc;

    public SettingsRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<String> find(String key) {
        return jdbc.sql("SELECT \"value\" FROM settings WHERE \"key\" = :key")
                .param("key", key).query(String.class).optional();
    }

    public Map<String, String> findAll() {
        Map<String, String> all = new LinkedHashMap<>();
        jdbc.sql("SELECT \"key\", \"value\" FROM settings ORDER BY \"key\"")
                .query((rs, row) -> all.put(rs.getString(1), rs.getString(2)))
                .list();
        return Map.copyOf(all);
    }

    /** Insert or update one row; callers that write several keys wrap the calls in one transaction. */
    public void upsert(String key, String value, OffsetDateTime now) {
        int updated = jdbc.sql("UPDATE settings SET \"value\" = :value, updated_at = :now WHERE \"key\" = :key")
                .param("value", value).param("now", now).param("key", key).update();
        if (updated == 0) {
            jdbc.sql("INSERT INTO settings (\"key\", \"value\", updated_at) VALUES (:key, :value, :now)")
                    .param("key", key).param("value", value).param("now", now).update();
        }
    }

    /** Atomically adds one to a numeric setting and returns the new value (single SQL statement). */
    public long increment(String key, OffsetDateTime now) {
        jdbc.sql("UPDATE settings SET \"value\" = CAST(CAST(\"value\" AS BIGINT) + 1 AS VARCHAR(20)), "
                        + "updated_at = :now WHERE \"key\" = :key")
                .param("now", now).param("key", key).update();
        return Long.parseLong(find(key).orElseThrow());
    }
}
