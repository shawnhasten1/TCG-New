-- Reactions and comments on feed posts. Anyone who can see a post (its author and the author's friends) can react
-- to it or comment on it. Taking a post down takes its reactions and comments with it.

-- One reaction per player per post; picking another replaces it. created_at is when it was last set, for the badge.
CREATE TABLE post_reactions (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('like', 'dislike', 'wow', 'laugh')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, user_id)
);

-- A flat list of comments under a post, oldest first.
CREATE TABLE post_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX post_comments_by_post ON post_comments(post_id, created_at);
CREATE INDEX post_comments_by_user ON post_comments(user_id, created_at);
