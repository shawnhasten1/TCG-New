-- Cards listed for the market to buy. Offers aren't stored: each is worked out from the seed and its number
-- (offerFor in src/market/protocol.ts). A listing stays 'open' after its last offer; it's over by the clock.

CREATE TABLE listings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The card: its pack and position in it, as in trades.
  pack_id TEXT NOT NULL,
  slot INTEGER NOT NULL,
  -- JSON TradeCard (src/social/protocol.ts), to show it without downloading its set.
  card TEXT NOT NULL,
  -- What the market counts the card as, in coins, and whether that came from a price.
  value INTEGER NOT NULL,
  priced INTEGER NOT NULL,
  seed TEXT NOT NULL,
  listed_at INTEGER NOT NULL,
  -- failed: the card was gone (traded, deleted) by the time it was sold.
  status TEXT NOT NULL CHECK (status IN ('open', 'sold', 'kept', 'failed')),
  sold_for INTEGER,
  resolved_at INTEGER
);
CREATE INDEX listings_user ON listings(user_id, listed_at);
CREATE INDEX listings_card ON listings(user_id, pack_id, slot, listed_at);

-- Selling checks, inside the same transaction as the sale, that each listing is still open and its card still there,
-- like trade_checks: a failed CHECK rolls the whole sale back. Rows are deleted at the end of the sale.
CREATE TABLE sale_checks (
  sale_id TEXT NOT NULL,
  n INTEGER NOT NULL,
  ok INTEGER NOT NULL CHECK (ok = 1),
  PRIMARY KEY (sale_id, n)
);
