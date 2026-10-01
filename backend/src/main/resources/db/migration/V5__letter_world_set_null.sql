-- Phase 2 hardening: deleting a world must not destroy its love letters. The letter is kept with world_id NULL
-- (letters without a world are never exposed to viewers; the admin can re-attach or delete them).
ALTER TABLE letter DROP CONSTRAINT fk_letter_world;
ALTER TABLE letter ADD CONSTRAINT fk_letter_world FOREIGN KEY (world_id) REFERENCES world (id) ON DELETE SET NULL;
