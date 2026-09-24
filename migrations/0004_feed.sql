-- The friends feed: cards players share from packs they opened.

-- One post per pack; sharing more cards from the same pack adds them to it.
CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pack_id TEXT NOT NULL,
  -- JSON { id, name, serieId, official } of the pack's set, so the feed shows without downloading sets.
  set_info TEXT NOT NULL,
  -- JSON array of { slot, finish, firstEdition, card } in pack order; card is the TCGdex card as the app uses it.
  cards TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, pack_id)
);
CREATE INDEX posts_by_user ON posts(user_id, created_at);

-- When the player last looked at the feed, for the "new posts" badge.
ALTER TABLE users ADD COLUMN feed_seen_at INTEGER NOT NULL DEFAULT 0;
