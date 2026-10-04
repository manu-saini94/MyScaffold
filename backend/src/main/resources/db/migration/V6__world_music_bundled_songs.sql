-- A world's music may also be a song bundled with the app (served from /assets/music/), not only an https URL.
-- Mirrors ContentDtos.MUSIC_URL: the request validation stays the authority, this is the last line of defence.
ALTER TABLE world DROP CONSTRAINT ck_world_music;
ALTER TABLE world ADD CONSTRAINT ck_world_music CHECK (music_url IS NULL OR music_url LIKE 'https://%'
    OR REGEXP_LIKE(music_url, '^/assets/music/[a-z0-9][a-z0-9-]*\.(mp3|m4a|ogg|opus)$'));
