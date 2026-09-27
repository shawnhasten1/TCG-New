-- More than one trading card game. An account is shared, but packs belong to one game ("pokemon", or a demo game
-- like "mtg" where DEMO_GAMES turns it on): each game has its own collection, pack allowance and dealt pack.
-- Everything from before is Pokémon, and production only ever deals Pokémon, so nothing changes there.

ALTER TABLE packs ADD COLUMN game TEXT NOT NULL DEFAULT 'pokemon';
CREATE INDEX packs_game_changes ON packs(user_id, game, seq, pack_id);

-- One dealt pack per player per game, so the key gains the game. SQLite can't change a primary key in place, and
-- nothing references this table, so it's rebuilt.
CREATE TABLE dealt_packs_new (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game TEXT NOT NULL DEFAULT 'pokemon',
  deal_id TEXT NOT NULL UNIQUE,
  set_id TEXT NOT NULL,
  -- JSON array of { cardId, localId, finish, firstEdition }, as stored in packs.
  cards TEXT NOT NULL,
  -- JSON array of { slot, outcome } per card, for the reveal.
  reveal TEXT NOT NULL,
  art TEXT,
  dealt_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, game)
);
INSERT INTO dealt_packs_new (user_id, game, deal_id, set_id, cards, reveal, art, dealt_at)
  SELECT user_id, 'pokemon', deal_id, set_id, cards, reveal, art, dealt_at FROM dealt_packs;
DROP TABLE dealt_packs;
ALTER TABLE dealt_packs_new RENAME TO dealt_packs;
