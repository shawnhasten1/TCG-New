// Friends: friend codes, requests and accepting them. Friends see each other's display name and avatar, never email.
//
// Every change answers with the whole updated list, so the page just shows what comes back.

import { CODE_ALPHABET, CODE_LENGTH, normalizeFriendCode, parseDisplayName, type FriendEntry, type FriendsResponse, type InboxResponse } from "../src/social/protocol";
import { HttpError, json, readJson, type Ctx } from "./http";
import { requireUser, type UserRow } from "./session";

/** Most unanswered requests one player can have out at once. */
const MAX_OUTGOING = 50;
const ID = "[0-9a-f-]{36}";

export async function handleFriends(ctx: Ctx): Promise<Response> {
  const user = await requireUser(ctx);
  const route = `${ctx.req.method} ${ctx.url.pathname}`;
  if (route === "GET /api/social/inbox") return inbox(ctx, user);
  if (route === "GET /api/friends") return list(ctx, user);
  if (route === "POST /api/friends/name") return setName(ctx, user);
  if (route === "POST /api/friends/request") return request(ctx, user);
  let m = route.match(new RegExp(`^POST /api/friends/(${ID})/accept$`));
  if (m) return accept(ctx, user, m[1]);
  m = route.match(new RegExp(`^DELETE /api/friends/(${ID})$`));
  if (m) return remove(ctx, user, m[1]);
  throw new HttpError(404, "Not found");
}

/** Friendships are stored once per pair, lower id first. */
const pair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

interface FriendshipRow {
  requested_by: string;
  status: "pending" | "accepted";
}

const friendship = (ctx: Ctx, a: string, b: string) =>
  ctx.env.DB.prepare("SELECT requested_by, status FROM friendships WHERE user_a = ? AND user_b = ?")
    .bind(...pair(a, b))
    .first<FriendshipRow>();

/* ---------- Friend codes ---------- */

function newCode(): string {
  // 32 characters, so the low 5 bits of each byte pick one evenly.
  return [...crypto.getRandomValues(new Uint8Array(CODE_LENGTH))].map((b) => CODE_ALPHABET[b & 31]).join("");
}

/** The user's friend code, made on first use. */
async function ensureCode(ctx: Ctx, user: UserRow): Promise<string> {
  if (user.friend_code) return user.friend_code;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const row = await ctx.env.DB.prepare("UPDATE users SET friend_code = COALESCE(friend_code, ?) WHERE id = ? RETURNING friend_code")
        .bind(newCode(), user.id)
        .first<{ friend_code: string }>();
      if (row) return (user.friend_code = row.friend_code);
    } catch (err) {
      // Someone else already has this code (about one in a trillion); roll again.
      if (!String(err).includes("UNIQUE")) throw err;
    }
  }
  throw new Error("Couldn't make a unique friend code");
}

/* ---------- Reads ---------- */

interface ListRow {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  requested_by: string;
  status: "pending" | "accepted";
  created_at: number;
  accepted_at: number | null;
}

async function friendsOf(ctx: Ctx, user: UserRow): Promise<FriendsResponse> {
  const code = await ensureCode(ctx, user);
  const { results } = await ctx.env.DB.prepare(
    `SELECT u.id, u.display_name, u.avatar_url, f.requested_by, f.status, f.created_at, f.accepted_at
     FROM friendships f JOIN users u ON u.id = CASE WHEN f.user_a = ?1 THEN f.user_b ELSE f.user_a END
     WHERE f.user_a = ?1 OR f.user_b = ?1`,
  )
    .bind(user.id)
    .all<ListRow>();
  const res: FriendsResponse = { me: { displayName: user.display_name, friendCode: code }, friends: [], incoming: [], outgoing: [] };
  for (const r of results) {
    // Someone you've sent a request to may not have picked a name yet.
    const entry: FriendEntry = { id: r.id, displayName: r.display_name ?? "New player", avatarUrl: r.avatar_url, since: r.accepted_at ?? r.created_at };
    (r.status === "accepted" ? res.friends : r.requested_by === user.id ? res.outgoing : res.incoming).push(entry);
  }
  res.friends.sort((a, b) => a.displayName.localeCompare(b.displayName));
  res.incoming.sort((a, b) => b.since - a.since);
  res.outgoing.sort((a, b) => b.since - a.since);
  return res;
}

const list = async (ctx: Ctx, user: UserRow) => json(await friendsOf(ctx, user));

async function inbox(ctx: Ctx, user: UserRow): Promise<Response> {
  const row = await ctx.env.DB.prepare("SELECT COUNT(*) AS n FROM friendships WHERE (user_a = ?1 OR user_b = ?1) AND status = 'pending' AND requested_by != ?1")
    .bind(user.id)
    .first<{ n: number }>();
  return json({ friendRequests: row?.n ?? 0 } satisfies InboxResponse);
}

/* ---------- Changes ---------- */

async function body<T>(ctx: Ctx): Promise<T> {
  return (await readJson<T | null>(ctx.req)) ?? ({} as T);
}

/** Runs a parser from the shared protocol, turning its complaint into a 400. */
function parse<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
}

function requireName(user: UserRow) {
  if (!user.display_name) throw new HttpError(400, "Pick a display name first, so your friends know who you are.");
}

async function setName(ctx: Ctx, user: UserRow): Promise<Response> {
  const { displayName } = await body<{ displayName?: unknown }>(ctx);
  const name = parse(() => parseDisplayName(displayName));
  await ctx.env.DB.prepare("UPDATE users SET display_name = ? WHERE id = ?").bind(name, user.id).run();
  return list(ctx, { ...user, display_name: name });
}

async function request(ctx: Ctx, user: UserRow): Promise<Response> {
  // Keyed by account, so nobody can walk through codes looking for players.
  const { success } = await ctx.env.FRIEND_LIMITER.limit({ key: user.id });
  if (!success) throw new HttpError(429, "That's a lot of requests. Wait a minute and try again.");
  requireName(user);

  const code = normalizeFriendCode((await body<{ code?: unknown }>(ctx)).code);
  if (!code) throw new HttpError(400, `A friend code is ${CODE_LENGTH} letters and numbers, like K7QX-3M9P.`);
  const other = await ctx.env.DB.prepare("SELECT id FROM users WHERE friend_code = ?").bind(code).first<{ id: string }>();
  if (!other) throw new HttpError(404, "No one has that friend code. Check it and try again.");
  if (other.id === user.id) throw new HttpError(400, "That's your own friend code.");

  const existing = await friendship(ctx, user.id, other.id);
  if (existing?.status === "accepted") throw new HttpError(409, "You're already friends.");
  // They'd already asked you: sending one back counts as yes.
  if (existing && existing.requested_by !== user.id) return accept(ctx, user, other.id);
  if (!existing) {
    const out = await ctx.env.DB.prepare("SELECT COUNT(*) AS n FROM friendships WHERE (user_a = ?1 OR user_b = ?1) AND status = 'pending' AND requested_by = ?1")
      .bind(user.id)
      .first<{ n: number }>();
    if ((out?.n ?? 0) >= MAX_OUTGOING) throw new HttpError(429, "You have lots of unanswered requests. Cancel some before sending more.");
    await ctx.env.DB.prepare("INSERT INTO friendships (user_a, user_b, requested_by, status, created_at) VALUES (?, ?, ?, 'pending', ?) ON CONFLICT DO NOTHING")
      .bind(...pair(user.id, other.id), user.id, Date.now())
      .run();
  }
  return list(ctx, user);
}

async function accept(ctx: Ctx, user: UserRow, otherId: string): Promise<Response> {
  requireName(user);
  const { meta } = await ctx.env.DB.prepare("UPDATE friendships SET status = 'accepted', accepted_at = ? WHERE user_a = ? AND user_b = ? AND status = 'pending' AND requested_by = ?")
    .bind(Date.now(), ...pair(user.id, otherId), otherId)
    .run();
  if (!meta.changes) {
    const now = await friendship(ctx, user.id, otherId);
    if (now?.status === "pending") throw new HttpError(409, "They haven't accepted yet.");
    if (!now) throw new HttpError(404, "That request was cancelled.");
  }
  return list(ctx, user);
}

/** Declines a request, cancels one you sent, or removes a friend. Already gone is fine. */
async function remove(ctx: Ctx, user: UserRow, otherId: string): Promise<Response> {
  await ctx.env.DB.prepare("DELETE FROM friendships WHERE user_a = ? AND user_b = ?")
    .bind(...pair(user.id, otherId))
    .run();
  return list(ctx, user);
}
