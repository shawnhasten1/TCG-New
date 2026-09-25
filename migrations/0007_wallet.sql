-- Coins, the market's play money: earned by selling cards to the market, spent on packs. Not real money.

-- A spend that would take the balance below zero fails the CHECK, which rolls back the batch it's in.
ALTER TABLE users ADD COLUMN coins INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0);

-- Every change to a player's coins, for their history (and for tracing bugs). Rows are only ever added.
CREATE TABLE wallet_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('sale', 'purchase', 'grant')),
  -- Coins in (positive) or out (negative), and the balance straight after.
  amount INTEGER NOT NULL,
  balance INTEGER NOT NULL,
  -- What it was for: a listing, a pack bought, and so on. NULL for grants.
  ref TEXT,
  -- Shown in the history, e.g. "Sold Charizard" or "Bought a Base Set pack".
  note TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX wallet_ledger_user ON wallet_ledger(user_id, created_at);
