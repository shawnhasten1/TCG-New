-- Market polish. Welcome coins: every member gets WELCOME_COINS once (src/market/protocol.ts), the first time they
-- use the market, so accounts from before this get them too, and so do guests once they sign up. 1 once they have.
ALTER TABLE users ADD COLUMN welcomed INTEGER NOT NULL DEFAULT 0;

-- Which trainer bought a sold card ("Hiker Tom"), for the history and for sharing the sale.
ALTER TABLE listings ADD COLUMN sold_to TEXT;

-- A post can be a sale shared from the market rather than cards from a pack: JSON { coins, to }, with pack_id
-- "sale:<listing>" and the one card sold. NULL for pack posts.
ALTER TABLE posts ADD COLUMN sale TEXT;
