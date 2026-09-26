-- Cards a player has starred, by card (e.g. "sv1-25"), not by copy: a favorite stays through trades, and can be a
-- card they don't own yet. Numbered 0013 because the yugioh-demo branch already has a 0012.
CREATE TABLE favorites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, card_id)
);
