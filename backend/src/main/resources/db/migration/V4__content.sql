-- Phase 2A: worlds, moments (a photo placed in a world) and letters. UTF-8 file; text is stored as-is.
CREATE TABLE world (
    id             VARCHAR(26)   NOT NULL PRIMARY KEY,
    slug           VARCHAR(64)   NOT NULL,
    title          VARCHAR(120)  NOT NULL,
    subtitle       VARCHAR(200),
    tagline        VARCHAR(200),
    layout         VARCHAR(32)   NOT NULL,
    cover_media_id VARCHAR(26),
    theme_accent   VARCHAR(7),
    sort_order     INT           NOT NULL,
    unlock_at      TIMESTAMP WITH TIME ZONE,
    intro_text     VARCHAR(2000),
    outro_text     VARCHAR(2000),
    music_url      VARCHAR(500),
    published      BOOLEAN       DEFAULT TRUE NOT NULL,
    created_at     TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at     TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT uq_world_slug UNIQUE (slug),
    CONSTRAINT ck_world_slug CHECK (REGEXP_LIKE(slug, '^[a-z0-9]+(-[a-z0-9]+)*$')),
    CONSTRAINT ck_world_layout CHECK (layout IN ('POLAROID_TABLE', 'FILM_STRIP', 'POSTCARDS', 'MEMORY_WALL',
                                                 'ENVELOPE', 'CONSTELLATION')),
    CONSTRAINT ck_world_accent CHECK (theme_accent IS NULL OR REGEXP_LIKE(theme_accent, '^#[0-9a-fA-F]{6}$')),
    CONSTRAINT ck_world_music CHECK (music_url IS NULL OR music_url LIKE 'https://%'),
    CONSTRAINT fk_world_cover FOREIGN KEY (cover_media_id) REFERENCES media (id) ON DELETE SET NULL
);
CREATE INDEX idx_world_sort ON world (sort_order, id);

CREATE TABLE moment (
    id          VARCHAR(26)  NOT NULL PRIMARY KEY,
    world_id    VARCHAR(26)  NOT NULL,
    media_id    VARCHAR(26)  NOT NULL,
    caption     VARCHAR(500),
    note        VARCHAR(2000),
    happened_on DATE,
    place       VARCHAR(200),
    sort_order  INT          NOT NULL,
    is_favourite BOOLEAN     DEFAULT FALSE NOT NULL,
    CONSTRAINT uq_moment_world_media UNIQUE (world_id, media_id),
    CONSTRAINT fk_moment_world FOREIGN KEY (world_id) REFERENCES world (id) ON DELETE CASCADE,
    CONSTRAINT fk_moment_media FOREIGN KEY (media_id) REFERENCES media (id) ON DELETE CASCADE
);
CREATE INDEX idx_moment_world_sort ON moment (world_id, sort_order);
CREATE INDEX idx_moment_media ON moment (media_id);

-- body is RAW markdown stored as-is. The frontend renders it safely; never render it as HTML on the server.
CREATE TABLE letter (
    id             VARCHAR(26)    NOT NULL PRIMARY KEY,
    world_id       VARCHAR(26),
    title          VARCHAR(160)   NOT NULL,
    body           VARCHAR(20000) NOT NULL,
    reveal_trigger VARCHAR(32)    NOT NULL,
    sort_order     INT            NOT NULL,
    created_at     TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_letter_trigger CHECK (reveal_trigger IN ('WORLD_OUTRO', 'SEALED_ICON')),
    CONSTRAINT fk_letter_world FOREIGN KEY (world_id) REFERENCES world (id) ON DELETE CASCADE
);
CREATE INDEX idx_letter_world ON letter (world_id, sort_order);

-- The six default worlds (empty; the owner fills them in the admin UI). Ids are fixed valid ULIDs.
INSERT INTO world (id, slug, title, subtitle, tagline, layout, theme_accent, sort_order, unlock_at,
                   intro_text, outro_text, published, created_at, updated_at) VALUES
('01K6G2V8Q3N7X4B2C9D5E1WA01', 'where-it-all-began', 'Where It All Began',
 'The first hello, and everything that quietly followed.', 'Every story has a first page.',
 'POLAROID_TABLE', '#d6304f', 1, NULL,
 'Some beginnings are so quiet you only recognise them later. Here is where ours started.',
 'And look how far a small hello can travel.', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('01K6G2V8Q4R1M9T6H3J8F5ZB02', 'our-firsts', 'Our Firsts',
 'First trips, first laughs, first of many.', 'The first time is only ever once.',
 'FILM_STRIP', '#d4553f', 2, NULL,
 'A reel of the firsts we will never get to have again, and the ones still waiting.',
 'So many firsts, and still more to come.', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('01K6G2V8Q5S2P7Y1K4G9N6AC03', 'adventures-together', 'Adventures Together',
 'Postcards from everywhere we have been.', 'Wish you were here. Oh wait, you were.',
 'POSTCARDS', '#b76e79', 3, NULL,
 'Wherever we went, the best part of the view was always the company.',
 'The map is far from full.', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('01K6G2V8Q6T3Q8Z2M5H0P7BD04', 'little-everyday-moments', 'Little Everyday Moments',
 'The ordinary days that turned out to be the best ones.', 'Nothing special, and everything.',
 'MEMORY_WALL', '#c43d6b', 4, NULL,
 'Coffee, couch, a long walk home — the small things were never small.',
 'Ordinary days, extraordinary company.', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('01K6G2V8Q7V4R9A3N6J1Q8CE05', 'the-question', 'The Question',
 'One evening, one ring, one yes.', 'The easiest hard question I ever asked.',
 'ENVELOPE', '#c9372f', 5, NULL,
 'There is a moment where everything holds its breath. This is that evening.',
 'And you said yes.', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('01K6G2V8Q8W5S0B4P7K2R9DF06', 'our-forever', 'Our Forever',
 'A sky of stars we have not written yet.', 'The best chapter is the next one.',
 'CONSTELLATION', '#e0455a', 6, TIMESTAMP WITH TIME ZONE '2027-02-14 00:00:00+05:30',
 'Every star here is a promise. Come back and see which ones we have kept.',
 'Forever starts today, and every day after.', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
