-- Every game-owned row says which game it belongs to, as packs and dealt_packs do since 0014. Everything from before
-- is Pokémon, so production doesn't change.
--
-- Coins are per game and never shared: each player has a wallet per game, with its own balance, history and welcome
-- coins. users.coins and users.welcomed become the Pokémon wallet and aren't used after this.

CREATE TABLE wallets (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game TEXT NOT NULL,
  -- A spend that would take the balance below zero fails the CHECK, which rolls back the batch it's in.
  coins INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0),
  -- 1 once they've had this game's welcome coins.
  welcomed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, game)
);
INSERT INTO wallets (user_id, game, coins, welcomed) SELECT id, 'pokemon', coins, welcomed FROM users WHERE coins != 0 OR welcomed != 0;

ALTER TABLE wallet_ledger ADD COLUMN game TEXT NOT NULL DEFAULT 'pokemon';
DROP INDEX wallet_ledger_user;
CREATE INDEX wallet_ledger_user ON wallet_ledger(user_id, game, created_at);

ALTER TABLE listings ADD COLUMN game TEXT NOT NULL DEFAULT 'pokemon';
ALTER TABLE pack_inventory ADD COLUMN game TEXT NOT NULL DEFAULT 'pokemon';
-- Trades are between cards of one game.
ALTER TABLE trades ADD COLUMN game TEXT NOT NULL DEFAULT 'pokemon';
-- The feed is shared by every game; each post says whose cards it shows.
ALTER TABLE posts ADD COLUMN game TEXT NOT NULL DEFAULT 'pokemon';
