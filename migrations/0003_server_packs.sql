-- Packs are dealt and opened by the server. Players who haven't signed up get a silent guest account.

-- Guests have no email, but users.email is NOT NULL, and rebuilding the table would cascade-delete every
-- session and pack. So a guest's email is the placeholder "guest-<id>": it has no "@", so it can never be
-- signed in with or collide with a real address, and it's never shown (see publicUser).
ALTER TABLE users ADD COLUMN guest INTEGER NOT NULL DEFAULT 0;

-- The pack each player has been dealt but hasn't torn yet: at most one, so it can't be rerolled.
-- Opening it moves it into packs, with deal_id as the pack id.
CREATE TABLE dealt_packs (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  deal_id TEXT NOT NULL UNIQUE,
  set_id TEXT NOT NULL,
  -- JSON array of { cardId, localId, finish, firstEdition }, as stored in packs.
  cards TEXT NOT NULL,
  -- JSON array of { slot, outcome } per card, for the reveal.
  reveal TEXT NOT NULL,
  dealt_at INTEGER NOT NULL
);

-- TCGdex responses the Worker needs to deal packs (set list, set cards), keyed like the app's own cache.
CREATE TABLE api_cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
