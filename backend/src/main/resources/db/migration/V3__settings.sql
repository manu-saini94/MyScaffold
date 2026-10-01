-- Phase 2B: key/value application settings. NON-SECRET defaults only.
-- The unlock question and the hashed answers are NEVER seeded here: they come from the environment
-- (OURSTORY_UNLOCK_QUESTION / OURSTORY_UNLOCK_ANSWERS, see UnlockBootstrap) or the admin settings API.
-- "key" and "value" are reserved words in H2, hence the quoted lower-case identifiers (also valid elsewhere).
CREATE TABLE settings (
    "key"      VARCHAR(64)    NOT NULL PRIMARY KEY,
    "value"    VARCHAR(10000) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

INSERT INTO settings ("key", "value", updated_at) VALUES ('app_title', 'Anvi ❤ Manu', CURRENT_TIMESTAMP);
INSERT INTO settings ("key", "value", updated_at) VALUES ('tagline', 'Love you till eternity and back', CURRENT_TIMESTAMP);
INSERT INTO settings ("key", "value", updated_at) VALUES ('default_theme', 'rose', CURRENT_TIMESTAMP);
INSERT INTO settings ("key", "value", updated_at) VALUES ('special_date', '2027-02-14', CURRENT_TIMESTAMP);
INSERT INTO settings ("key", "value", updated_at) VALUES ('her_name', 'Anvi', CURRENT_TIMESTAMP);
INSERT INTO settings ("key", "value", updated_at) VALUES ('my_name', 'Manu', CURRENT_TIMESTAMP);
INSERT INTO settings ("key", "value", updated_at) VALUES ('easter_egg_nicknames', '["anvi"]', CURRENT_TIMESTAMP);
INSERT INTO settings ("key", "value", updated_at) VALUES ('hero_media_ids', '[]', CURRENT_TIMESTAMP);
INSERT INTO settings ("key", "value", updated_at) VALUES ('viewer_epoch', '1', CURRENT_TIMESTAMP);
