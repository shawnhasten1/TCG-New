-- Friends: a display name and friend code per player, and friendships (pending requests and accepted ones).

-- What friends see instead of your email. Set the first time you use friends.
ALTER TABLE users ADD COLUMN display_name TEXT;
-- 8 characters from src/social/protocol.ts's alphabet, made the first time the friends page loads.
ALTER TABLE users ADD COLUMN friend_code TEXT;
CREATE UNIQUE INDEX users_friend_code ON users(friend_code);

-- One row per pair, stored with user_a < user_b. A declined or cancelled request is simply deleted.
CREATE TABLE friendships (
  user_a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Who sent the request; the other one accepts it.
  requested_by TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at INTEGER NOT NULL,
  accepted_at INTEGER,
  PRIMARY KEY (user_a, user_b),
  CHECK (user_a < user_b)
);
CREATE INDEX friendships_b ON friendships(user_b);
