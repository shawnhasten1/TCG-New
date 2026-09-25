// The friends feed: players share cards from packs they opened, and see their friends' and their own shares.
//
// A post is one pack. Sharing more cards from the same pack adds them to its post. A post can also be a card sold on
// the market (worker/market.ts), shared when the player asks, with what it sold for. Posts carry the card data
// they show (from the Worker's TCGdex cache), so reading the feed never needs whole sets. Posts from someone
// who's no longer a friend simply stop showing.
//
// Anyone who can see a post can react to it (one reaction each) and comment on it. Comments are a flat list; the
// commenter or the post's author can delete one.

import { isOpenedPack, type RemoteCard } from "../src/sync/protocol";
import {
  COMMENTS_SHOWN,
  isReaction,
  MAX_COMMENTS_PER_POST,
  parseCommentText,
  parseSlots,
  type CommentResponse,
  type CommentsResponse,
  type FeedComment,
  type FeedPost,
  type FeedResponse,
  type ReactionCounts,
  type ReactionKind,
  type ReactionResponse,
  type ReactorsResponse,
  type ShareRequest,
  type SharedCard,
} from "../src/social/protocol";
import { tcgdex } from "./cache";
import { HttpError, json, readJson, type Ctx } from "./http";
import { openStatements } from "./packs";
import { requireMember, type UserRow } from "./session";

const PAGE = 20;
const ID = "[0-9a-f-]{36}";
/** Comments one player can post a minute. */
const COMMENTS_PER_MINUTE = 10;

export async function handleFeed(ctx: Ctx): Promise<Response> {
  const user = await requireMember(ctx);
  const route = `${ctx.req.method} ${ctx.url.pathname}`;
  if (route === "GET /api/feed") return feed(ctx, user);
  if (route === "POST /api/feed/share") return share(ctx, user);
  const m = route.match(new RegExp(`^DELETE /api/feed/(${ID})$`));
  if (m) return takeDown(ctx, user, m[1]);
  const r = route.match(new RegExp(`^(PUT|DELETE) /api/feed/(${ID})/reaction$`));
  if (r) return react(ctx, user, r[2], r[1] === "PUT");
  const rs = route.match(new RegExp(`^GET /api/feed/(${ID})/reactions$`));
  if (rs) return reactors(ctx, user, rs[1]);
  const c = route.match(new RegExp(`^(GET|POST) /api/feed/(${ID})/comments$`));
  if (c) return c[1] === "GET" ? comments(ctx, user, c[2]) : comment(ctx, user, c[2]);
  const d = route.match(new RegExp(`^DELETE /api/feed/(${ID})/comments/(${ID})$`));
  if (d) return deleteComment(ctx, user, d[1], d[2]);
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
  sale: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

const toPost = (r: PostRow, me: string, extra: Pick<FeedPost, "reactions" | "myReaction" | "commentCount" | "comments">): FeedPost => ({
  id: r.id,
  author: { id: r.user_id, displayName: r.display_name ?? "New player", avatarUrl: r.avatar_url },
  mine: r.user_id === me,
  set: JSON.parse(r.set_info),
  cards: JSON.parse(r.cards),
  createdAt: r.created_at,
  ...(r.sale && { sale: JSON.parse(r.sale) }),
  ...extra,
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
    `SELECT p.id, p.user_id, p.set_info, p.cards, p.created_at, p.sale, u.display_name, u.avatar_url
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
  const extras = await postExtras(ctx.env.DB, user.id, page);
  return json({ posts: page.map((r) => toPost(r, user.id, extras(r))), cursor: results.length > PAGE && last ? `${last.created_at}:${last.id}` : null } satisfies FeedResponse);
}

interface CommentRow {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: number;
  display_name: string | null;
  avatar_url: string | null;
}

const toComment = (r: CommentRow, me: string, postAuthor: string): FeedComment => ({
  id: r.id,
  author: { id: r.user_id, displayName: r.display_name ?? "New player", avatarUrl: r.avatar_url },
  text: r.body,
  createdAt: r.created_at,
  mine: r.user_id === me,
  canDelete: r.user_id === me || postAuthor === me,
});

/** Reaction counts, your reaction and the latest comments for a page of posts, in one round trip. */
async function postExtras(db: D1Database, me: string, page: PostRow[]) {
  const ids = JSON.stringify(page.map((p) => p.id));
  const IN = "(SELECT value FROM json_each(?1))";
  const [counts, mine, latest] = await db.batch([
    db.prepare(`SELECT post_id, kind, COUNT(*) AS n FROM post_reactions WHERE post_id IN ${IN} GROUP BY post_id, kind`).bind(ids),
    db.prepare(`SELECT post_id, kind FROM post_reactions WHERE post_id IN ${IN} AND user_id = ?2`).bind(ids, me),
    db
      .prepare(
        `SELECT * FROM (
           SELECT c.id, c.post_id, c.user_id, c.body, c.created_at, u.display_name, u.avatar_url,
             ROW_NUMBER() OVER (PARTITION BY c.post_id ORDER BY c.created_at DESC, c.id DESC) AS rn,
             COUNT(*) OVER (PARTITION BY c.post_id) AS total
           FROM post_comments c JOIN users u ON u.id = c.user_id WHERE c.post_id IN ${IN}
         ) WHERE rn <= ?2 ORDER BY created_at, id`,
      )
      .bind(ids, COMMENTS_SHOWN),
  ]);
  const reactions = new Map<string, ReactionCounts>();
  for (const r of counts.results as { post_id: string; kind: ReactionKind; n: number }[]) reactions.set(r.post_id, { ...reactions.get(r.post_id), [r.kind]: r.n });
  const myReaction = new Map((mine.results as { post_id: string; kind: ReactionKind }[]).map((r) => [r.post_id, r.kind]));
  const comments = new Map<string, { total: number; rows: CommentRow[] }>();
  for (const r of latest.results as (CommentRow & { total: number })[]) {
    const entry = comments.get(r.post_id) ?? { total: r.total, rows: [] };
    entry.rows.push(r);
    comments.set(r.post_id, entry);
  }
  return (p: PostRow) => ({
    reactions: reactions.get(p.id) ?? {},
    myReaction: myReaction.get(p.id) ?? null,
    commentCount: comments.get(p.id)?.total ?? 0,
    comments: comments.get(p.id)?.rows.map((c) => toComment(c, me, p.user_id)) ?? [],
  });
}

/**
 * What's new since the feed was last looked at, for the badge: friends' posts, reactions and comments on your posts,
 * and comments on friends' posts you've commented on.
 */
export async function feedNew(ctx: Ctx, user: UserRow): Promise<number> {
  const SEEN = "(SELECT feed_seen_at FROM users WHERE id = ?1)";
  const row = await ctx.env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM posts WHERE user_id IN (${FRIEND_IDS}) AND created_at > ${SEEN})
     + (SELECT COUNT(*) FROM post_reactions r JOIN posts p ON p.id = r.post_id WHERE p.user_id = ?1 AND r.user_id != ?1 AND r.created_at > ${SEEN})
     + (SELECT COUNT(*) FROM post_comments c JOIN posts p ON p.id = c.post_id
        WHERE c.user_id != ?1 AND c.created_at > ${SEEN}
          AND (p.user_id = ?1 OR (p.user_id IN (${FRIEND_IDS}) AND EXISTS (SELECT 1 FROM post_comments m WHERE m.post_id = p.id AND m.user_id = ?1)))) AS n`,
  )
    .bind(user.id)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/* ---------- Sharing ---------- */

async function share(ctx: Ctx, user: UserRow): Promise<Response> {
  const body = (await readJson<Partial<ShareRequest> | null>(ctx.req)) ?? {};
  const packId = typeof body.packId === "string" && body.packId.length <= 64 ? body.packId : undefined;
  if (!packId) throw new HttpError(400, "Which pack?");
  if (!isOpenedPack(packId)) throw new HttpError(400, "Only cards you pulled from packs can be shared.");
  const db = ctx.env.DB;

  // Sharing straight from the reveal can beat the sync that opens the pack, so open it here too.
  await db.batch(openStatements(db, user.id, packId));
  const pack = await db.prepare("SELECT set_id, cards FROM packs WHERE user_id = ? AND pack_id = ? AND deleted = 0").bind(user.id, packId).first<{ set_id: string; cards: string }>();
  if (!pack) throw new HttpError(404, "That pack isn't in your collection.");
  const packCards = JSON.parse(pack.cards) as RemoteCard[];
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
    if (c.gone) throw new HttpError(409, "You've traded that card away.");
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

/* ---------- Reactions and comments ---------- */

/** The author of a post you can see (yours or a friend's), or 404. */
async function visiblePost(ctx: Ctx, me: string, postId: string): Promise<string> {
  const row = await ctx.env.DB.prepare(`SELECT user_id FROM posts WHERE id = ?2 AND (user_id = ?1 OR user_id IN (${FRIEND_IDS}))`)
    .bind(me, postId)
    .first<{ user_id: string }>();
  if (!row) throw new HttpError(404, "That post is gone.");
  return row.user_id;
}

async function react(ctx: Ctx, user: UserRow, postId: string, set: boolean): Promise<Response> {
  await visiblePost(ctx, user.id, postId);
  const db = ctx.env.DB;
  if (set) {
    const { kind } = (await readJson<{ kind?: unknown } | null>(ctx.req)) ?? {};
    if (!isReaction(kind)) throw new HttpError(400, "Pick a reaction.");
    // Picking the same one again leaves it (and its time, for the badge) as it was.
    await db
      .prepare(
        "INSERT INTO post_reactions (post_id, user_id, kind, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (post_id, user_id) DO UPDATE SET kind = excluded.kind, created_at = excluded.created_at WHERE kind != excluded.kind",
      )
      .bind(postId, user.id, kind, Date.now())
      .run();
  } else {
    await db.prepare("DELETE FROM post_reactions WHERE post_id = ? AND user_id = ?").bind(postId, user.id).run();
  }
  const [counts, mine] = await db.batch([
    db.prepare("SELECT kind, COUNT(*) AS n FROM post_reactions WHERE post_id = ? GROUP BY kind").bind(postId),
    db.prepare("SELECT kind FROM post_reactions WHERE post_id = ? AND user_id = ?").bind(postId, user.id),
  ]);
  const reactions: ReactionCounts = Object.fromEntries((counts.results as { kind: ReactionKind; n: number }[]).map((r) => [r.kind, r.n]));
  return json({ reactions, myReaction: (mine.results[0] as { kind: ReactionKind } | undefined)?.kind ?? null } satisfies ReactionResponse);
}

async function reactors(ctx: Ctx, user: UserRow, postId: string): Promise<Response> {
  await visiblePost(ctx, user.id, postId);
  const { results } = await ctx.env.DB.prepare(
    "SELECT r.user_id, r.kind, u.display_name, u.avatar_url FROM post_reactions r JOIN users u ON u.id = r.user_id WHERE r.post_id = ? ORDER BY r.created_at DESC",
  )
    .bind(postId)
    .all<{ user_id: string; kind: ReactionKind; display_name: string | null; avatar_url: string | null }>();
  return json({
    reactors: results.map((r) => ({ user: { id: r.user_id, displayName: r.display_name ?? "New player", avatarUrl: r.avatar_url }, kind: r.kind })),
  } satisfies ReactorsResponse);
}

const COMMENT_ROW = "SELECT c.id, c.post_id, c.user_id, c.body, c.created_at, u.display_name, u.avatar_url FROM post_comments c JOIN users u ON u.id = c.user_id";

async function comments(ctx: Ctx, user: UserRow, postId: string): Promise<Response> {
  const author = await visiblePost(ctx, user.id, postId);
  const { results } = await ctx.env.DB.prepare(`${COMMENT_ROW} WHERE c.post_id = ? ORDER BY c.created_at, c.id`).bind(postId).all<CommentRow>();
  return json({ comments: results.map((r) => toComment(r, user.id, author)) } satisfies CommentsResponse);
}

async function comment(ctx: Ctx, user: UserRow, postId: string): Promise<Response> {
  if (!user.display_name) throw new HttpError(400, "Pick a display name first, so your friends know who's commenting.");
  const author = await visiblePost(ctx, user.id, postId);
  const body = (await readJson<{ text?: unknown } | null>(ctx.req, 8 * 1024)) ?? {};
  let text: string;
  try {
    text = parseCommentText(body.text);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
  const db = ctx.env.DB;
  const now = Date.now();
  const limits = await db
    .prepare("SELECT (SELECT COUNT(*) FROM post_comments WHERE user_id = ?1 AND created_at > ?2) AS recent, (SELECT COUNT(*) FROM post_comments WHERE post_id = ?3) AS total")
    .bind(user.id, now - 60_000, postId)
    .first<{ recent: number; total: number }>();
  if ((limits?.recent ?? 0) >= COMMENTS_PER_MINUTE) throw new HttpError(429, "That's a lot of comments. Wait a minute and try again.");
  if ((limits?.total ?? 0) >= MAX_COMMENTS_PER_POST) throw new HttpError(429, "This post has all the comments it can take.");

  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO post_comments (id, post_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)").bind(id, postId, user.id, text, now).run();
  const row: CommentRow = { id, post_id: postId, user_id: user.id, body: text, created_at: now, display_name: user.display_name, avatar_url: user.avatar_url };
  return json({ comment: toComment(row, user.id, author), commentCount: (limits?.total ?? 0) + 1 } satisfies CommentResponse);
}

async function deleteComment(ctx: Ctx, user: UserRow, postId: string, commentId: string): Promise<Response> {
  const author = await visiblePost(ctx, user.id, postId);
  const db = ctx.env.DB;
  // Yours, or anyone's on your post.
  await db
    .prepare("DELETE FROM post_comments WHERE id = ? AND post_id = ? AND (user_id = ? OR ?)")
    .bind(commentId, postId, user.id, author === user.id ? 1 : 0)
    .run();
  const row = await db.prepare("SELECT COUNT(*) AS n FROM post_comments WHERE post_id = ?").bind(postId).first<{ n: number }>();
  return json({ commentCount: row?.n ?? 0 });
}
