// The market: players list cards, the market makes offers for them, and players sell or keep them. How offers work is
// in src/market/protocol.ts; this is where they're checked and paid.
//
// Selling works like accepting a trade: one D1 batch (one transaction) that starts with a check per card, written to
// sale_checks, whose CHECK constraint fails if the listing was answered or the card traded, deleted or sold in the
// meantime, and that rolls everything back. A sold card stays in its pack marked `gone` ("sale:<listing>"), with a
// new seq so sync drops it on every device, and the coins land in the same batch.

import { listingCloses, MAX_LIST_AT_ONCE, MAX_LISTED, offerAt, offerFor, offerOpen, OFFERS, offersIn, parseIds, type Listing, type ListRequest, type KeepRequest, type MarketResponse, type SellRequest, type SellResponse, type ShareSaleRequest } from "../src/market/protocol";
import type { SharedCard, TradeCard } from "../src/social/protocol";
import { parseCardUid, type RemoteCard } from "../src/sync/protocol";
import { pruneDailyEntries } from "./cache";
import { ownedCards, withCardData } from "./cards";
import { HttpError, json, randomToken, readJson, type Ctx } from "./http";
import { requireMember } from "./session";
import { buy, getUnopened, listUnopened } from "./shop";
import { valueCards, walletStatements, welcome } from "./wallet";

const isId = (s: string) => /^[0-9a-f-]{36}$/.test(s);
/** How long a listing is open for, if the player doesn't sell or keep the card. */
const LIFETIME = listingCloses(0);
const NEXT_SEQ = (param: number) => `(SELECT COALESCE(MAX(seq), 0) + 1 FROM packs WHERE user_id = ?${param})`;

export async function handleMarket(ctx: Ctx): Promise<Response> {
  const user = await requireMember(ctx);
  await welcome(ctx.env.DB, user);
  const route = `${ctx.req.method} ${ctx.url.pathname}`;
  if (route === "GET /api/market") return json(await market(ctx, user.id));
  if (route === "POST /api/market/list") return list(ctx, user.id);
  if (route === "POST /api/market/sell") return sell(ctx, user.id);
  if (route === "POST /api/market/keep") return keep(ctx, user.id);
  if (route === "POST /api/market/share") return shareSale(ctx, user.id);
  if (route === "POST /api/market/buy") return buy(ctx, user.id);
  if (route === "GET /api/market/packs") return listUnopened(ctx, user.id);
  const pack = route.match(/^GET \/api\/market\/packs\/(s-[0-9a-f-]{36})$/);
  if (pack) return getUnopened(ctx, user.id, pack[1]);
  throw new HttpError(404, "Not found");
}

/* ---------- Reading ---------- */

interface ListingRow {
  id: string;
  pack_id: string;
  slot: number;
  card: string;
  value: number;
  priced: number;
  seed: string;
  listed_at: number;
}

const LISTING_COLUMNS = "id, pack_id, slot, card, value, priced, seed, listed_at";

function toListing(r: ListingRow, now: number): Listing {
  const count = offersIn(r.listed_at, now);
  return {
    id: r.id,
    card: JSON.parse(r.card) as TradeCard,
    value: r.value,
    priced: !!r.priced,
    listedAt: r.listed_at,
    offers: Array.from({ length: count }, (_, n) => offerFor(r.value, r.seed, n)),
    nextAt: count < OFFERS ? offerAt(r.listed_at, count) : null,
    closesAt: listingCloses(r.listed_at),
  };
}

async function market(ctx: Ctx, userId: string): Promise<MarketResponse> {
  const db = ctx.env.DB;
  const now = Date.now();
  const [balance, open] = await Promise.all([
    db.prepare("SELECT coins FROM users WHERE id = ?").bind(userId).first<{ coins: number }>(),
    db
      .prepare(`SELECT ${LISTING_COLUMNS} FROM listings WHERE user_id = ? AND status = 'open' AND listed_at > ? ORDER BY listed_at, rowid`)
      .bind(userId, now - LIFETIME)
      .all<ListingRow>(),
  ]);
  return { coins: balance?.coins ?? 0, listings: open.results.map((r) => toListing(r, now)), now };
}

/* ---------- Listing ---------- */

async function list(ctx: Ctx, userId: string): Promise<Response> {
  const body = (await readJson<Partial<ListRequest> | null>(ctx.req)) ?? {};
  let uids: string[];
  try {
    uids = parseIds(body.uids, (s) => !!parseCardUid(s), "card", MAX_LIST_AT_ONCE);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
  const db = ctx.env.DB;
  const current = await market(ctx, userId);
  if (current.listings.length + uids.length > MAX_LISTED) throw new HttpError(429, `You can have up to ${MAX_LISTED} cards listed at once. Sell or keep some first.`);
  const listed = new Set(current.listings.map((l) => l.card.uid));
  if (uids.some((u) => listed.has(u))) throw new HttpError(409, "Some of those cards are listed already.");

  const owned = new Map((await ownedCards(db, userId)).map((c) => [c.uid, c]));
  const picked = uids.map((u) => owned.get(u));
  if (picked.some((c) => !c)) throw new HttpError(409, "Some of those cards aren't in your collection any more.");
  const cards = await withCardData(ctx, picked as NonNullable<(typeof picked)[number]>[]);
  const values = await valueCards(ctx, cards);

  const now = Date.now();
  await db.batch(
    cards.map((c, i) => {
      const { packId, slot } = parseCardUid(c.uid)!;
      return db
        .prepare("INSERT INTO listings (id, user_id, pack_id, slot, card, value, priced, seed, listed_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')")
        .bind(crypto.randomUUID(), userId, packId, slot, JSON.stringify(c), values[i].coins, values[i].priced ? 1 : 0, randomToken(16), now);
    }),
  );
  // Pricing the cards cached today's prices; tidy away past days' while we're here.
  await pruneDailyEntries(db);
  return json(await market(ctx, userId));
}

/* ---------- Answering ---------- */

function parseOffers(v: unknown): SellRequest["offers"] {
  const offers = Array.isArray(v) ? v : [];
  const ids = parseIds(
    offers.map((o: unknown) => (o && typeof o === "object" && Number.isInteger((o as { n?: unknown }).n) ? (o as { id?: unknown }).id : undefined)),
    isId,
    "offer",
    MAX_LISTED,
  );
  const n = new Map(offers.map((o: { id: string; n: number }) => [o.id, o.n]));
  return ids.map((id) => ({ id, n: n.get(id)! }));
}

async function sell(ctx: Ctx, userId: string): Promise<Response> {
  const body = (await readJson<Partial<SellRequest> | null>(ctx.req)) ?? {};
  let offers: SellRequest["offers"];
  try {
    offers = parseOffers(body.offers);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
  const db = ctx.env.DB;
  const now = Date.now();
  const { results: rows } = await db
    .prepare(`SELECT ${LISTING_COLUMNS} FROM listings WHERE user_id = ? AND status = 'open' AND id IN (SELECT value FROM json_each(?))`)
    .bind(userId, JSON.stringify(offers.map((o) => o.id)))
    .all<ListingRow>();
  const byId = new Map(rows.map((r) => [r.id, r]));
  // Offers that have come in, while their listing's open.
  const takes = offers.flatMap((o) => {
    const row = byId.get(o.id);
    return row && offerOpen(row.listed_at, o.n, now) ? [{ row, ...offerFor(row.value, row.seed, o.n), card: JSON.parse(row.card) as TradeCard }] : [];
  });

  // Cards traded or deleted since they were listed can't be sold; the rest still can.
  const { results: packRows } = await db
    .prepare("SELECT pack_id, cards FROM packs WHERE user_id = ? AND deleted = 0 AND pack_id IN (SELECT value FROM json_each(?))")
    .bind(userId, JSON.stringify([...new Set(takes.map((t) => t.row.pack_id))]))
    .all<{ pack_id: string; cards: string }>();
  const packs = new Map(packRows.map((p) => [p.pack_id, JSON.parse(p.cards) as RemoteCard[]]));
  const there = (t: (typeof takes)[number]) => {
    const card = packs.get(t.row.pack_id)?.[t.row.slot];
    return !!card && !card.gone;
  };
  const gone = takes.filter((t) => !there(t));
  const selling = takes.filter(there);
  if (gone.length) {
    await db.batch(gone.map((t) => db.prepare("UPDATE listings SET status = 'failed', resolved_at = ? WHERE id = ? AND status = 'open'").bind(now, t.row.id)));
  }

  const earned = selling.reduce((sum, t) => sum + t.coins, 0);
  if (selling.length) {
    const saleId = crypto.randomUUID();
    const top = [...selling].sort((a, b) => b.coins - a.coins)[0];
    const statements: D1PreparedStatement[] = [
      // Every listing still open and its card still there.
      ...selling.map((t, n) =>
        db
          .prepare(
            `INSERT INTO sale_checks (sale_id, n, ok) VALUES (?1, ?2,
               EXISTS (SELECT 1 FROM listings WHERE id = ?3 AND status = 'open') AND
               EXISTS (SELECT 1 FROM packs WHERE user_id = ?4 AND pack_id = ?5 AND deleted = 0 AND json_extract(cards, ?6) IS NOT NULL AND json_extract(cards, ?7) IS NULL))`,
          )
          .bind(saleId, n, t.row.id, userId, t.row.pack_id, `$[${t.row.slot}]`, `$[${t.row.slot}].gone`),
      ),
      ...selling.map((t) =>
        db.prepare(`UPDATE packs SET cards = json_set(cards, ?3, ?4), seq = ${NEXT_SEQ(1)} WHERE user_id = ?1 AND pack_id = ?2`).bind(userId, t.row.pack_id, `$[${t.row.slot}].gone`, `sale:${t.row.id}`),
      ),
      ...selling.map((t) => db.prepare("UPDATE listings SET status = 'sold', sold_for = ?, sold_to = ?, resolved_at = ? WHERE id = ?").bind(t.coins, t.from, now, t.row.id)),
      ...walletStatements(db, userId, { kind: "sale", amount: earned, ref: saleId, note: selling.length === 1 ? `Sold ${top.card.card.name} to ${top.from}` : `Sold ${top.card.card.name} and ${selling.length - 1} more` }),
      db.prepare("DELETE FROM sale_checks WHERE sale_id = ?").bind(saleId),
    ];
    try {
      await db.batch(statements);
    } catch (err) {
      if (!String(err).includes("CHECK constraint failed")) throw err;
      throw new HttpError(409, "Something changed while selling, so nothing was sold. Try again.");
    }
  }
  return json({ ...(await market(ctx, userId)), sold: selling.length, soldIds: selling.map((t) => t.row.id), earned, missed: offers.length - selling.length } satisfies SellResponse);
}

async function keep(ctx: Ctx, userId: string): Promise<Response> {
  const body = (await readJson<Partial<KeepRequest> | null>(ctx.req)) ?? {};
  let ids: string[];
  try {
    ids = parseIds(body.ids, isId, "listing", MAX_LISTED);
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
  await ctx.env.DB.prepare("UPDATE listings SET status = 'kept', resolved_at = ? WHERE user_id = ? AND status = 'open' AND id IN (SELECT value FROM json_each(?))")
    .bind(Date.now(), userId, JSON.stringify(ids))
    .run();
  return json(await market(ctx, userId));
}

/* ---------- Sharing a sale ---------- */

/** Posts a sold card to the friends feed, with what it sold for. Sharing it again does nothing. */
async function shareSale(ctx: Ctx, userId: string): Promise<Response> {
  const body = (await readJson<Partial<ShareSaleRequest> | null>(ctx.req)) ?? {};
  const id = typeof body.id === "string" && isId(body.id) ? body.id : undefined;
  if (!id) throw new HttpError(400, "Which sale?");
  const db = ctx.env.DB;
  const row = await db.prepare("SELECT card, sold_for, sold_to FROM listings WHERE id = ? AND user_id = ? AND status = 'sold'").bind(id, userId).first<{ card: string; sold_for: number; sold_to: string | null }>();
  if (!row) throw new HttpError(404, "Only cards you've sold can be shared.");
  const c = JSON.parse(row.card) as TradeCard;
  const shared: SharedCard = { slot: parseCardUid(c.uid)?.slot ?? 0, finish: c.finish, firstEdition: c.firstEdition, card: c.card };
  await db
    .prepare("INSERT INTO posts (id, user_id, pack_id, set_info, cards, created_at, sale) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, pack_id) DO NOTHING")
    .bind(crypto.randomUUID(), userId, `sale:${id}`, JSON.stringify(c.set), JSON.stringify([shared]), Date.now(), JSON.stringify({ coins: row.sold_for, to: row.sold_to ?? "a trainer" }))
    .run();
  return json({ ok: true });
}
