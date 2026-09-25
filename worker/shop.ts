// The pack shop: members spend coins on a pack from a set they choose. Prices are in src/market/shop.ts.
//
// A bought pack is rolled when it's bought, like a dealt pack, and waits in pack_inventory until it's opened, so
// holding on to one can't reroll it. The coins come off and the pack goes in in one D1 batch: if the balance can't
// cover it, its CHECK fails and neither happens.

import { formatCoins } from "../src/market/protocol";
import { MAX_UNOPENED, SHOP_PACK_PREFIX, shopPrice, type BuyRequest, type BuyResponse, type UnopenedPack, type UnopenedResponse } from "../src/market/shop";
import type { DealtCard, DealtPack } from "../src/packs/protocol";
import type { SyncCard } from "../src/sync/protocol";
import { tcgdex } from "./cache";
import { HttpError, json, readJson, type Ctx } from "./http";
import { rollSet } from "./packs";
import { isOverdrawn, walletStatements } from "./wallet";

const unopenedCount = async (db: D1Database, userId: string) =>
  (await db.prepare("SELECT COUNT(*) AS n FROM pack_inventory WHERE user_id = ?").bind(userId).first<{ n: number }>())?.n ?? 0;

export async function buy(ctx: Ctx, userId: string): Promise<Response> {
  const body = (await readJson<Partial<BuyRequest> | null>(ctx.req)) ?? {};
  const setId = typeof body.setId === "string" ? body.setId : "";
  const price = shopPrice(setId);
  if (!price) throw new HttpError(404, "The shop doesn't sell packs from that set.");

  const db = ctx.env.DB;
  if ((await unopenedCount(db, userId)) >= MAX_UNOPENED) throw new HttpError(429, `You have ${MAX_UNOPENED} unopened packs. Open some before buying more.`);
  const coins = (await db.prepare("SELECT coins FROM users WHERE id = ?").bind(userId).first<{ coins: number }>())?.coins ?? 0;
  if (coins < price) throw new HttpError(402, `That pack costs ${formatCoins(price)}. You have ${formatCoins(coins)}.`);

  const rolled = await rollSet(ctx, setId);
  if (!("row" in rolled)) {
    console.error(`The shop sells ${setId}, but it can't fill a pack: ${rolled.unopenable}`);
    throw new HttpError(503, "Packs from that set can't be opened right now. Try another set.");
  }
  const { row, setName } = rolled;
  const id = `${SHOP_PACK_PREFIX}${row.deal_id}`;
  try {
    await db.batch([
      ...walletStatements(db, userId, { kind: "purchase", amount: -price, ref: id, note: `Bought a ${setName} pack` }),
      db
        .prepare("INSERT INTO pack_inventory (id, user_id, set_id, cards, reveal, art, price, bought_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(id, userId, setId, row.cards, row.reveal, row.art, price, Date.now()),
    ]);
  } catch (err) {
    if (isOverdrawn(err)) throw new HttpError(402, `That pack costs ${formatCoins(price)}, more than you have.`);
    throw err;
  }
  const after = (await db.prepare("SELECT coins FROM users WHERE id = ?").bind(userId).first<{ coins: number }>())?.coins ?? 0;
  return json({ coins: after, pack: { id, setId, art: row.art }, unopened: await unopenedCount(db, userId) } satisfies BuyResponse);
}

/* ---------- Unopened packs ---------- */

interface InventoryRow {
  id: string;
  set_id: string;
  cards: string;
  reveal: string;
  art: string | null;
  price: number;
  bought_at: number;
}

export async function listUnopened(ctx: Ctx, userId: string): Promise<Response> {
  const { results } = await ctx.env.DB.prepare("SELECT id, set_id, art, price, bought_at FROM pack_inventory WHERE user_id = ? ORDER BY bought_at DESC, rowid DESC")
    .bind(userId)
    .all<Omit<InventoryRow, "cards" | "reveal">>();
  // Names and logos from the Worker's cached set list, so the app needn't fetch it just to label packs.
  const sets = new Map(
    (
      await tcgdex(ctx.env)
        .client.listSetSummaries()
        .catch((err) => (console.error("Couldn't load the set list", err), []))
    ).map((s) => [s.id, s]),
  );
  const packs = results.map((r): UnopenedPack => ({ id: r.id, setId: r.set_id, setName: sets.get(r.set_id)?.name, logo: sets.get(r.set_id)?.logo, art: r.art, price: r.price, boughtAt: r.bought_at }));
  return json({ packs } satisfies UnopenedResponse);
}

/** One unopened pack with its cards, as a dealt pack, for the opener. Opening it goes through sync, like a dealt pack. */
export async function getUnopened(ctx: Ctx, userId: string, id: string): Promise<Response> {
  const r = await ctx.env.DB.prepare("SELECT id, set_id, cards, reveal, art FROM pack_inventory WHERE user_id = ? AND id = ?").bind(userId, id).first<InventoryRow>();
  if (!r) throw new HttpError(404, "That pack isn't waiting to be opened. It may have been opened already.");
  const cards = JSON.parse(r.cards) as SyncCard[];
  const reveal = JSON.parse(r.reveal) as Pick<DealtCard, "slot" | "outcome">[];
  return json({ dealId: r.id, setId: r.set_id, art: r.art, cards: cards.map((c, i) => ({ ...c, ...reveal[i] })) } satisfies DealtPack);
}
