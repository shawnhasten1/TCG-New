// Trades between friends. One player offers some of their cards for some of the other's; the other accepts or
// declines, and the sender can cancel while it's waiting.
//
// Accepting swaps the cards in one D1 batch, which is one transaction. The batch starts with a check per card, written
// to trade_checks, whose CHECK constraint fails if the card has since been traded, deleted or the trade answered, and
// that rolls everything back. So two offers for the same card can never both go through.
//
// A card handed over stays in its pack, marked `gone` with the trade id (see sync/protocol.ts). The cards each player
// receives arrive as new packs, one per set, with ids starting "t-". Every changed pack gets a new seq, so sync
// carries the swap to every device.

import { parseCardUid, TRADE_PACK_PREFIX, type RemoteCard, type SyncCard } from "../src/sync/protocol";
import { MAX_OPEN_TRADES, parseTradeSide, type OwnedCard, type Trade, type TradeCard, type TradeRequest, type TradesResponse, type TradeStatus } from "../src/social/protocol";
import { tcgdex } from "./cache";
import { ownedCards } from "./cards";
import { areFriends } from "./friends";
import { HttpError, json, readJson, type Ctx } from "./http";
import { requireMember, type UserRow } from "./session";

const ID = "[0-9a-f-]{36}";
/** Finished trades stay in the list this long. */
const HISTORY_MS = 30 * 24 * 60 * 60 * 1000;
const NEXT_SEQ = (param: number) => `(SELECT COALESCE(MAX(seq), 0) + 1 FROM packs WHERE user_id = ?${param})`;

export async function handleTrades(ctx: Ctx): Promise<Response> {
  const user = await requireMember(ctx);
  const route = `${ctx.req.method} ${ctx.url.pathname}`;
  if (route === "GET /api/trades") return list(ctx, user);
  if (route === "POST /api/trades") return create(ctx, user);
  const m = route.match(new RegExp(`^POST /api/trades/(${ID})/(accept|decline|cancel)$`));
  if (m?.[2] === "accept") return accept(ctx, user, m[1]);
  if (m) return answer(ctx, user, m[1], m[2] as "decline" | "cancel");
  throw new HttpError(404, "Not found");
}

/** Offers waiting for this player's answer, for the badge. */
export async function tradeOffers(ctx: Ctx, user: UserRow): Promise<number> {
  const row = await ctx.env.DB.prepare("SELECT COUNT(*) AS n FROM trades WHERE to_user = ? AND status = 'pending'").bind(user.id).first<{ n: number }>();
  return row?.n ?? 0;
}

/* ---------- Reading ---------- */

interface TradeRow {
  id: string;
  from_user: string;
  to_user: string;
  status: TradeStatus;
  cards: string;
  created_at: number;
  resolved_at: number | null;
  from_name: string | null;
  from_avatar: string | null;
  to_name: string | null;
  to_avatar: string | null;
}

const toTrade = (r: TradeRow, me: string): Trade => {
  const { give, get } = JSON.parse(r.cards) as { give: TradeCard[]; get: TradeCard[] };
  return {
    id: r.id,
    from: { id: r.from_user, displayName: r.from_name ?? "New player", avatarUrl: r.from_avatar },
    to: { id: r.to_user, displayName: r.to_name ?? "New player", avatarUrl: r.to_avatar },
    mine: r.from_user === me,
    status: r.status,
    give,
    get,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  };
};

async function trades(ctx: Ctx, user: UserRow): Promise<TradesResponse> {
  const { results } = await ctx.env.DB.prepare(
    `SELECT t.*, f.display_name AS from_name, f.avatar_url AS from_avatar, o.display_name AS to_name, o.avatar_url AS to_avatar
     FROM trades t JOIN users f ON f.id = t.from_user JOIN users o ON o.id = t.to_user
     WHERE (t.from_user = ?1 OR t.to_user = ?1) AND (t.status = 'pending' OR t.resolved_at > ?2)
     ORDER BY COALESCE(t.resolved_at, t.created_at) DESC LIMIT 100`,
  )
    .bind(user.id, Date.now() - HISTORY_MS)
    .all<TradeRow>();
  const res: TradesResponse = { incoming: [], outgoing: [], history: [] };
  for (const r of results) {
    const t = toTrade(r, user.id);
    (t.status !== "pending" ? res.history : t.mine ? res.outgoing : res.incoming).push(t);
  }
  return res;
}

const list = async (ctx: Ctx, user: UserRow) => json(await trades(ctx, user));

/* ---------- Offering ---------- */

/** Card data for each card, from the Worker's TCGdex cache (one set download per set involved, usually cached). */
async function withCardData(ctx: Ctx, cards: OwnedCard[]): Promise<TradeCard[]> {
  const { client } = tcgdex(ctx.env);
  const sets = new Map(
    await Promise.all(
      [...new Set(cards.map((c) => c.setId))].map(async (id) => {
        try {
          return [id, await client.getSetCards(id)] as const;
        } catch (err) {
          console.error(`Couldn't load ${id} for a trade`, err);
          throw new HttpError(503, "Couldn't reach the card database. Try again in a moment.");
        }
      }),
    ),
  );
  return cards.map((c) => {
    const data = sets.get(c.setId)!;
    const card = data.cards.find((x) => x.id === c.cardId);
    if (!card) throw new HttpError(503, "Couldn't find one of those cards in the card database. Try again in a while.");
    return {
      uid: c.uid,
      finish: c.finish,
      firstEdition: c.firstEdition,
      card,
      set: { id: data.set.id, name: data.set.name, serieId: data.set.serie.id, official: data.set.cardCount.official },
    };
  });
}

/** Picks `uids` out of a player's cards, or says which side has cards it doesn't own. */
async function pick(ctx: Ctx, userId: string, uids: string[], whose: "your" | "their"): Promise<OwnedCard[]> {
  if (!uids.length) return [];
  const owned = new Map((await ownedCards(ctx.env.DB, userId)).map((c) => [c.uid, c]));
  const picked = uids.map((u) => owned.get(u));
  if (picked.some((c) => !c)) throw new HttpError(409, `Some of ${whose} cards in this offer aren't in ${whose} collection any more.`);
  return picked as OwnedCard[];
}

async function create(ctx: Ctx, user: UserRow): Promise<Response> {
  const body = (await readJson<Partial<TradeRequest> | null>(ctx.req)) ?? {};
  const to = typeof body.to === "string" && new RegExp(`^${ID}$`).test(body.to) ? body.to : undefined;
  if (!to || to === user.id) throw new HttpError(400, "Who's the offer for?");
  if (!(await areFriends(ctx.env.DB, user.id, to))) throw new HttpError(403, "You can only trade with friends.");
  let give: string[], get: string[];
  try {
    const isUid = (s: unknown) => !!parseCardUid(s);
    give = parseTradeSide(body.give, isUid);
    get = parseTradeSide(body.get, isUid);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
  if (!give.length && !get.length) throw new HttpError(400, "Pick at least one card to trade.");

  const open = await ctx.env.DB.prepare("SELECT COUNT(*) AS n FROM trades WHERE from_user = ? AND status = 'pending'").bind(user.id).first<{ n: number }>();
  if ((open?.n ?? 0) >= MAX_OPEN_TRADES) throw new HttpError(429, "You have lots of offers waiting. Cancel some before sending more.");

  const [mine, theirs] = await Promise.all([pick(ctx, user.id, give, "your"), pick(ctx, to, get, "their")]);
  const [giveCards, getCards] = await Promise.all([withCardData(ctx, mine), withCardData(ctx, theirs)]);
  await ctx.env.DB.prepare("INSERT INTO trades (id, from_user, to_user, status, cards, created_at) VALUES (?, ?, ?, 'pending', ?, ?)")
    .bind(crypto.randomUUID(), user.id, to, JSON.stringify({ give: giveCards, get: getCards }), Date.now())
    .run();
  return list(ctx, user);
}

/* ---------- Answering ---------- */

async function answer(ctx: Ctx, user: UserRow, id: string, how: "decline" | "cancel"): Promise<Response> {
  const [status, who] = how === "decline" ? ["declined", "to_user"] : ["cancelled", "from_user"];
  const { meta } = await ctx.env.DB.prepare(`UPDATE trades SET status = ?, resolved_at = ? WHERE id = ? AND ${who} = ? AND status = 'pending'`)
    .bind(status, Date.now(), id, user.id)
    .run();
  if (!meta.changes) throw new HttpError(409, "That offer has already been answered.");
  return list(ctx, user);
}

interface Handover {
  /** Who hands the card over, and who gets it. */
  from: string;
  to: string;
  packId: string;
  slot: number;
}

async function accept(ctx: Ctx, user: UserRow, id: string): Promise<Response> {
  const db = ctx.env.DB;
  const trade = await db.prepare("SELECT from_user, to_user, status, cards FROM trades WHERE id = ? AND to_user = ?").bind(id, user.id).first<Pick<TradeRow, "from_user" | "to_user" | "status" | "cards">>();
  if (!trade) throw new HttpError(404, "That offer isn't for you.");
  if (trade.status !== "pending") throw new HttpError(409, "That offer has already been answered.");
  const fail = async (message: string) => {
    await db.prepare("UPDATE trades SET status = 'failed', resolved_at = ? WHERE id = ? AND status = 'pending'").bind(Date.now(), id).run();
    return new HttpError(409, message);
  };
  if (!(await areFriends(db, trade.from_user, trade.to_user))) throw await fail("You're not friends any more, so this trade can't go through.");

  const { give, get } = JSON.parse(trade.cards) as { give: TradeCard[]; get: TradeCard[] };
  const handovers: Handover[] = [
    ...give.map((c) => ({ from: trade.from_user, to: trade.to_user, ...parseCardUid(c.uid)! })),
    ...get.map((c) => ({ from: trade.to_user, to: trade.from_user, ...parseCardUid(c.uid)! })),
  ];

  // Read the cards as they are now, to copy into the received packs. The checks below make sure nothing changed.
  const packs = new Map<string, { set_id: string; cards: RemoteCard[] }>();
  for (const h of handovers) {
    const key = `${h.from}/${h.packId}`;
    if (packs.has(key)) continue;
    const row = await db.prepare("SELECT set_id, cards FROM packs WHERE user_id = ? AND pack_id = ? AND deleted = 0").bind(h.from, h.packId).first<{ set_id: string; cards: string }>();
    if (row) packs.set(key, { set_id: row.set_id, cards: JSON.parse(row.cards) });
  }
  const cardOf = (h: Handover) => packs.get(`${h.from}/${h.packId}`)?.cards[h.slot];
  if (handovers.some((h) => !cardOf(h) || cardOf(h)!.gone)) throw await fail("Some of the cards in this trade aren't available any more, so it couldn't go through.");

  const now = Date.now();
  const openedAt = new Date(now).toISOString();
  const statements: D1PreparedStatement[] = [
    // Still waiting for an answer.
    db.prepare("INSERT INTO trade_checks (trade_id, n, ok) VALUES (?1, -1, (SELECT status = 'pending' FROM trades WHERE id = ?1))").bind(id),
    // Every card still where it was.
    ...handovers.map((h, n) =>
      db
        .prepare(
          `INSERT INTO trade_checks (trade_id, n, ok) VALUES (?1, ?2, EXISTS (
             SELECT 1 FROM packs WHERE user_id = ?3 AND pack_id = ?4 AND deleted = 0 AND json_extract(cards, ?5) IS NOT NULL AND json_extract(cards, ?6) IS NULL))`,
        )
        .bind(id, n, h.from, h.packId, `$[${h.slot}]`, `$[${h.slot}].gone`),
    ),
    // Hand each card over: marked gone where it was...
    ...handovers.map((h) =>
      db.prepare(`UPDATE packs SET cards = json_set(cards, ?3, ?4), seq = ${NEXT_SEQ(1)} WHERE user_id = ?1 AND pack_id = ?2`).bind(h.from, h.packId, `$[${h.slot}].gone`, id),
    ),
    // ...and into a new pack per set for whoever receives it.
    ...receivedPacks(handovers, packs, cardOf).map((p, n) =>
      db
        .prepare(`INSERT INTO packs (user_id, pack_id, set_id, opened_at, cards, deleted, seq) VALUES (?1, ?2, ?3, ?4, ?5, 0, ${NEXT_SEQ(1)})`)
        .bind(p.to, `${TRADE_PACK_PREFIX}${id}-${n}`, p.setId, openedAt, JSON.stringify(p.cards)),
    ),
    db.prepare("UPDATE trades SET status = 'accepted', resolved_at = ? WHERE id = ?").bind(now, id),
    db.prepare("DELETE FROM trade_checks WHERE trade_id = ?").bind(id),
  ];
  try {
    await db.batch(statements);
  } catch (err) {
    if (!String(err).includes("CHECK constraint failed")) throw err;
    throw await fail("Some of the cards in this trade aren't available any more, so it couldn't go through.");
  }
  return list(ctx, user);
}

/** The cards each player receives, grouped into one pack per set. */
function receivedPacks(handovers: Handover[], packs: Map<string, { set_id: string }>, cardOf: (h: Handover) => RemoteCard | undefined) {
  const out = new Map<string, { to: string; setId: string; cards: SyncCard[] }>();
  for (const h of handovers) {
    const setId = packs.get(`${h.from}/${h.packId}`)!.set_id;
    const key = `${h.to}/${setId}`;
    const { cardId, localId, finish, firstEdition } = cardOf(h)!;
    (out.get(key) ?? out.set(key, { to: h.to, setId, cards: [] }).get(key)!).cards.push({ cardId, localId, finish, firstEdition });
  }
  return [...out.values()];
}
