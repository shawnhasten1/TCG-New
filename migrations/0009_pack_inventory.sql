-- Packs bought in the shop and not opened yet. They're rolled when bought, like a dealt pack, so waiting can't reroll
-- one. Opening moves a pack into packs with the same id ("s-<uuid>"); those don't count against the free-pack
-- allowance or pity.

CREATE TABLE pack_inventory (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  set_id TEXT NOT NULL,
  -- As in dealt_packs: JSON { cardId, localId, finish, firstEdition } per card, and { slot, outcome } per card.
  cards TEXT NOT NULL,
  reveal TEXT NOT NULL,
  art TEXT,
  -- What it cost, in coins.
  price INTEGER NOT NULL,
  bought_at INTEGER NOT NULL
);
CREATE INDEX pack_inventory_user ON pack_inventory(user_id, bought_at);
