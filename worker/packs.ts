// Dealing and opening packs. The server rolls every pack, so a collection only ever holds cards from real packs.
//
// A dealt pack waits in dealt_packs until it's torn; asking again returns the same one, so it can't be rerolled.
// Opening moves it into packs (with the deal id as its pack id), where sync picks it up like any other change.

import type { SetSummary } from "../src/api/types";
import { whyNotOpenable, openPack } from "../src/engine/openPack";
import { profileFor } from "../src/engine/profiles";
import { drawableSets, ERAS, pickRandomSet } from "../src/engine/randomSet";
import { createRng } from "../src/engine/rng";
import { pityFloor, PITY } from "../src/engine/setRarity";
import { ALLOWANCE_WINDOW_MS, packAllowance, type DealRequest, type DealResponse, type DealtCard, type DealtPack } from "../src/packs/protocol";
import type { SyncCard } from "../src/sync/protocol";
import { tcgdex } from "./cache";
import { HttpError, json, randomToken, readJson, type Ctx } from "./http";
import { requireUser } from "./session";

/** Sets tried when a drawn set can't fill a pack. */
const MAX_REDRAWS = 6;
const UNOPENABLE_KEY = "unopenable-sets";
/** Pity only looks back this far. */
const HISTORY = Math.max(...PITY.map((p) => p.every));

export async function handlePacks(ctx: Ctx): Promise<Response> {
  const user = await requireUser(ctx);
  if (ctx.req.method === "POST" && ctx.url.pathname === "/api/packs/deal") return deal(ctx, user.id);
  throw new HttpError(404, "Not found");
}

/** Statements that open a dealt pack: it joins the collection with the next seq. Nothing happens if it isn't dealt. */
export function openStatements(db: D1Database, userId: string, dealId: string): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `INSERT INTO packs (user_id, pack_id, set_id, opened_at, cards, deleted, seq)
         SELECT user_id, deal_id, set_id, ?3, cards, 0, (SELECT COALESCE(MAX(seq), 0) + 1 FROM packs WHERE user_id = ?1)
         FROM dealt_packs WHERE user_id = ?1 AND deal_id = ?2
         ON CONFLICT (user_id, pack_id) DO NOTHING`,
      )
      .bind(userId, dealId, new Date().toISOString()),
    db.prepare("DELETE FROM dealt_packs WHERE user_id = ? AND deal_id = ?").bind(userId, dealId),
  ];
}

interface DealtRow {
  deal_id: string;
  set_id: string;
  cards: string;
  reveal: string;
}

function toPack(r: DealtRow): DealtPack {
  const cards = JSON.parse(r.cards) as SyncCard[];
  const reveal = JSON.parse(r.reveal) as Pick<DealtCard, "slot" | "outcome">[];
  return { dealId: r.deal_id, setId: r.set_id, cards: cards.map((c, i) => ({ ...c, ...reveal[i] })) };
}

const dealtPack = (ctx: Ctx, userId: string) =>
  ctx.env.DB.prepare("SELECT deal_id, set_id, cards, reveal FROM dealt_packs WHERE user_id = ?").bind(userId).first<DealtRow>();

async function allowanceFor(ctx: Ctx, userId: string) {
  const now = Date.now();
  // Deleted packs count too: throwing cards away doesn't give packs back.
  const { results } = await ctx.env.DB.prepare("SELECT opened_at FROM packs WHERE user_id = ? AND opened_at >= ?")
    .bind(userId, new Date(now - ALLOWANCE_WINDOW_MS).toISOString())
    .all<{ opened_at: string }>();
  return packAllowance(results.map((r) => Date.parse(r.opened_at)), now);
}

function parseDeal(body: DealRequest | null): { eras: string[]; opened?: string } {
  const known = new Set<string>(ERAS.map((e) => e.id));
  const eras = Array.isArray(body?.eras) ? body.eras.filter((e): e is string => typeof e === "string" && known.has(e)) : [];
  const opened = typeof body?.opened === "string" && body.opened.length <= 64 ? body.opened : undefined;
  return { eras, opened };
}

async function deal(ctx: Ctx, userId: string): Promise<Response> {
  const { eras, opened } = parseDeal(await readJson<DealRequest | null>(ctx.req));
  const db = ctx.env.DB;
  if (opened) await db.batch(openStatements(db, userId, opened));

  const allowance = await allowanceFor(ctx, userId);
  const waiting = await dealtPack(ctx, userId);
  if (waiting) return json({ pack: toPack(waiting), allowance } satisfies DealResponse);
  if (allowance.left === 0) return json({ pack: null, allowance } satisfies DealResponse);

  const { results } = await db.prepare("SELECT set_id FROM packs WHERE user_id = ? ORDER BY opened_at DESC LIMIT ?").bind(userId, HISTORY).all<{ set_id: string }>();
  const history = results.map((r) => r.set_id).reverse();
  const row = await roll(ctx, eras, history);

  // Two tabs asking at once: the first one's pack wins, and both get it.
  await db
    .prepare("INSERT INTO dealt_packs (user_id, deal_id, set_id, cards, reveal, dealt_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (user_id) DO NOTHING")
    .bind(userId, row.deal_id, row.set_id, row.cards, row.reveal, Date.now())
    .run();
  const pack = (await dealtPack(ctx, userId)) ?? row;
  return json({ pack: toPack(pack), allowance } satisfies DealResponse);
}

/** Draws a set (weighted by rarity, with pity) and rolls a pack from it. */
async function roll(ctx: Ctx, eras: string[], history: string[]): Promise<DealtRow> {
  const { client, cache } = tcgdex(ctx.env);
  const unopenable = (await cache.get<Record<string, string>>(UNOPENABLE_KEY)) ?? {};
  let sets: SetSummary[];
  try {
    sets = await client.listSetSummaries();
  } catch (err) {
    console.error("Couldn't load the set list", err);
    throw new HttpError(503, "Couldn't reach the card database. Try again in a moment.");
  }
  const floor = pityFloor(history);

  let avoid: string | undefined;
  for (let attempt = 0; attempt <= MAX_REDRAWS; attempt++) {
    const set = pickRandomSet(drawableSets(sets, { unopenable, eras }), Math.random, { avoid, floor });
    if (!set) break;
    let data;
    try {
      data = await client.getSetCards(set.id);
    } catch (err) {
      console.error(`Couldn't load ${set.id}`, err);
      throw new HttpError(503, "Couldn't reach the card database. Try again in a moment.");
    }
    const profile = profileFor(data.set);
    const reason = profile ? whyNotOpenable(data, profile) : "No pack profile for this series";
    if (!profile || reason) {
      unopenable[set.id] = reason ?? "Unopenable";
      await cache.set(UNOPENABLE_KEY, unopenable);
      avoid = set.id;
      continue;
    }
    const pulls = openPack(data, profile, createRng(randomToken(16)));
    return {
      deal_id: crypto.randomUUID(),
      set_id: set.id,
      cards: JSON.stringify(pulls.map((p): SyncCard => ({ cardId: p.card.id, localId: p.card.localId, finish: p.finish, firstEdition: p.firstEdition }))),
      reveal: JSON.stringify(pulls.map((p) => ({ slot: p.slot, outcome: p.outcome }))),
    };
  }
  throw new HttpError(503, "No set could be opened. Check the era filter in Settings.");
}
