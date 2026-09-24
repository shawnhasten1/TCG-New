// The friends feed: players share cards from packs they opened, and see their friends' and their own shares.
//
// A post is one pack. Sharing more cards from the same pack adds them to its post. Posts carry the card data
// they show (from the Worker's TCGdex cache), so reading the feed never needs whole sets. Posts from someone
// who's no longer a friend simply stop showing.

import type { SyncCard } from "../src/sync/protocol";
import { parseSlots, type FeedPost, type FeedResponse, type ShareRequest, type SharedCard } from "../src/social/protocol";
import { tcgdex } from "./cache";
import { HttpError, json, readJson, type Ctx } from "./http";
import { openStatements } from "./packs";
import { requireMember, type UserRow } from "./session";

const PAGE = 20;
const ID = "[0-9a-f-]{36}";

export async function handleFeed(ctx: Ctx): Promise<Response> {
  const user = await requireMember(ctx);
  const route = `${ctx.req.method} ${ctx.url.pathname}`;
  if (route === "GET /api/feed") return feed(ctx, user);
  if (route === "POST /api/feed/share") return share(ctx, user);
  const m = route.match(new RegExp(`^DELETE /api/feed/(${ID})$`));
  if (m) return takeDown(ctx, user, m[1]);
  throw new HttpError(404, "Not found");
}

/** Friends of ?1, for use in a query. */
export const FRIEND_IDS = "SELECT CASE WHEN user_a = ?1 THEN user_b ELSE user_a END FROM friendships WHERE (user_a = ?1 OR user_b = ?1) AND status = 'accepted'";

/* ---------- Reading ---------- */

interface PostRow {
  id: string;
  user_id: string;
  set_info: string;
  cards: string;
  created_at: number;
  display_name: string | null;
  avatar_url: string | null;
}

const toPost = (r: PostRow, me: string): FeedPost => ({
  id: r.id,
  author: { id: r.user_id, displayName: r.display_name ?? "New player", avatarUrl: r.avatar_url },
  mine: r.user_id === me,
  set: JSON.parse(r.set_info),
  cards: JSON.parse(r.cards),
  createdAt: r.created_at,
});

/** Cursor: "<created_at>:<id>" of the last post sent; the id breaks ties. */
function parseCursor(v: string | null): [number, string] | undefined {
  if (!v) return undefined;
  const i = v.indexOf(":");
  const t = Number(v.slice(0, i));
  if (i < 0 || !Number.isInteger(t)) throw new HttpError(400, "Bad cursor");
  return [t, v.slice(i + 1)];
}

async function feed(ctx: Ctx, user: UserRow): Promise<Response> {
  const before = parseCursor(ctx.url.searchParams.get("before"));
  const { results } = await ctx.env.DB.prepare(
    `SELECT p.id, p.user_id, p.set_info, p.cards, p.created_at, u.display_name, u.avatar_url
     FROM posts p JOIN users u ON u.id = p.user_id
     WHERE (p.user_id = ?1 OR p.user_id IN (${FRIEND_IDS})) AND (?2 IS NULL OR (p.created_at, p.id) < (?2, ?3))
     ORDER BY p.created_at DESC, p.id DESC LIMIT ?4`,
  )
    .bind(user.id, before?.[0] ?? null, before?.[1] ?? "", PAGE + 1)
    .all<PostRow>();
  const page = results.slice(0, PAGE);
  // The newest page counts as having seen the feed.
  if (!before) await ctx.env.DB.prepare("UPDATE users SET feed_seen_at = ? WHERE id = ?").bind(Date.now(), user.id).run();
  const last = page.at(-1);
  return json({ posts: page.map((r) => toPost(r, user.id)), cursor: results.length > PAGE && last ? `${last.created_at}:${last.id}` : null } satisfies FeedResponse);
}

/** Friends' posts since the feed was last looked at, for the badge. */
export async function feedNew(ctx: Ctx, user: UserRow): Promise<number> {
  const row = await ctx.env.DB.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id IN (${FRIEND_IDS}) AND created_at > (SELECT feed_seen_at FROM users WHERE id = ?1)`)
    .bind(user.id)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/* ---------- Sharing ---------- */

async function share(ctx: Ctx, user: UserRow): Promise<Response> {
  const body = (await readJson<Partial<ShareRequest> | null>(ctx.req)) ?? {};
  const packId = typeof body.packId === "string" && body.packId.length <= 64 ? body.packId : undefined;
  if (!packId) throw new HttpError(400, "Which pack?");
  const db = ctx.env.DB;

  // Sharing straight from the reveal can beat the sync that opens the pack, so open it here too.
  await db.batch(openStatements(db, user.id, packId));
  const pack = await db.prepare("SELECT set_id, cards FROM packs WHERE user_id = ? AND pack_id = ? AND deleted = 0").bind(user.id, packId).first<{ set_id: string; cards: string }>();
  if (!pack) throw new HttpError(404, "That pack isn't in your collection.");
  const packCards = JSON.parse(pack.cards) as SyncCard[];
  let slots: number[];
  try {
    slots = parseSlots(body.slots, packCards.length);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }

  let data;
  try {
    data = await tcgdex(ctx.env).client.getSetCards(pack.set_id);
  } catch (err) {
    console.error(`Couldn't load ${pack.set_id} to share`, err);
    throw new HttpError(503, "Couldn't reach the card database. Try again in a moment.");
  }
  const byId = new Map(data.cards.map((c) => [c.id, c]));
  const existing = await db.prepare("SELECT id, cards FROM posts WHERE user_id = ? AND pack_id = ?").bind(user.id, packId).first<{ id: string; cards: string }>();
  const cards = new Map<number, SharedCard>((existing ? (JSON.parse(existing.cards) as SharedCard[]) : []).map((c) => [c.slot, c]));
  for (const slot of slots) {
    const c = packCards[slot];
    const card = byId.get(c.cardId);
    if (!card) throw new HttpError(503, "Couldn't find that card in the card database. Try again in a while.");
    cards.set(slot, { slot, finish: c.finish, firstEdition: c.firstEdition, card });
  }
  const shared = JSON.stringify([...cards.values()].sort((a, b) => a.slot - b.slot));

  if (existing) {
    await db.prepare("UPDATE posts SET cards = ? WHERE id = ?").bind(shared, existing.id).run();
  } else {
    const setInfo = { id: data.set.id, name: data.set.name, serieId: data.set.serie.id, official: data.set.cardCount.official };
    // Two shares at once from the same pack: the second one merges into the first on retry.
    await db
      .prepare("INSERT INTO posts (id, user_id, pack_id, set_info, cards, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, pack_id) DO UPDATE SET cards = excluded.cards")
      .bind(crypto.randomUUID(), user.id, packId, JSON.stringify(setInfo), shared, Date.now())
      .run();
  }
  return json({ ok: true, slots: [...cards.keys()].sort((a, b) => a - b) });
}

async function takeDown(ctx: Ctx, user: UserRow, id: string): Promise<Response> {
  await ctx.env.DB.prepare("DELETE FROM posts WHERE id = ? AND user_id = ?").bind(id, user.id).run();
  return json({ ok: true });
}
