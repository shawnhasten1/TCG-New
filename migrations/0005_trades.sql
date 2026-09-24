-- Trades between friends: one player offers some of their cards for some of the other's.

CREATE TABLE trades (
  id TEXT PRIMARY KEY,
  from_user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- failed: a card in it was traded, deleted or otherwise gone by the time it was accepted.
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'failed')),
  -- JSON { give, get }: the cards each side hands over (from_user gives, to_user gives "get"), with the card data
  -- to show them, as TradeCard in src/social/protocol.ts.
  cards TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE INDEX trades_from ON trades(from_user, status);
CREATE INDEX trades_to ON trades(to_user, status);

-- Accepting a trade checks, inside the same transaction as the swap, that the trade is still open and every card is
-- still there: it writes a row per check here, and a failed CHECK rolls the whole swap back. The rows are deleted at
-- the end of the swap. (One row per card keeps each statement under D1's limit on bound parameters.)
CREATE TABLE trade_checks (
  trade_id TEXT NOT NULL,
  n INTEGER NOT NULL,
  ok INTEGER NOT NULL CHECK (ok = 1),
  PRIMARY KEY (trade_id, n)
);
