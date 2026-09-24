-- Accounts (email/password and Google), sessions, and each account's collection.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  -- 1 once Google has vouched for the address; password sign-ups aren't verified.
  email_verified INTEGER NOT NULL DEFAULT 0,
  name TEXT,
  avatar_url TEXT,
  -- "pbkdf2-sha256$<iterations>$<salt>$<hash>", or NULL for Google-only accounts.
  password_hash TEXT,
  google_sub TEXT UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  -- SHA-256 of the cookie token, so a leaked table can't be used to sign in.
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

-- One row per opened pack. Deleted packs stay as empty tombstones so every device learns of the delete.
-- seq rises with every change to a user's packs; devices ask for everything after the last seq they saw.
CREATE TABLE packs (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pack_id TEXT NOT NULL,
  set_id TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  -- JSON array of { cardId, localId, finish, firstEdition }.
  cards TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  seq INTEGER NOT NULL,
  PRIMARY KEY (user_id, pack_id)
);
CREATE INDEX packs_changes ON packs(user_id, seq, pack_id);
