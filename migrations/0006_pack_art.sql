-- Which photo of the real pack a pack came in (an id from src/packs/packArt.json), picked at random when it's dealt.
-- Collecting a set's different wrappers is part of the collection. NULL for sets without photos, trade packs, and
-- packs opened before this.
ALTER TABLE dealt_packs ADD COLUMN art TEXT;
ALTER TABLE packs ADD COLUMN art TEXT;
