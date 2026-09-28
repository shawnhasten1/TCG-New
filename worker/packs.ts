// Dealing and opening packs. The server rolls every pack, so a collection only ever holds cards from real packs.
//
// A dealt pack waits in dealt_packs until it's torn; asking again returns the same one, so it can't be rerolled.
// Opening moves it into packs (with the deal id as its pack id), where sync picks it up like any other change.

import type { SetSummary } from "../src/api/types";
import type { Game } from "../src/game";
import { whyNotOpenable, openPack } from "../src/engine/openPack";
import { profileFor } from "../src/engine/profiles";
import { drawableSets, ERAS, pickRandomSet } from "../src/engine/randomSet";
import { createRng } from "../src/engine/rng";
import { pityFloor, PITY } from "../src/engine/setRarity";
import { SHOP_PACK_PREFIX } from "../src/market/shop";
import { pickPackArt } from "../src/packs/art";
import { ALLOWANCE_WINDOW_MS, packAllowance, type DealRequest, type DealResponse, type DealtCard, type DealtPack } from "../src/packs/protocol";
import type { SyncCard } from "../src/sync/protocol";
import { tcgdex } from "./cache";
import { HttpError, json, randomToken, readJson, type Ctx } from "./http";
import { requireUser } from "./session";
import { requireGame } from "./games";
import { MTG_ERAS } from "../src/mtg/sets";
import { rollMtg } from "./mtg";
import { YGO_ERAS } from "../src/ygo/sets";
import { rollYgo } from "./ygo";

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

/**
 * Statements that open a pack: it joins the collection with the next seq. A dealt pack comes from dealt_packs, a
 * bought one ("s-") from pack_inventory. Nothing happens if there's no such pack waiting.
 */
export function openStatements(db: D1Database, userId: string, dealId: string): D1PreparedStatement[] {
  if (dealId.startsWith(SHOP_PACK_PREFIX)) {
    return [
      db
        .prepare(
          `INSERT INTO packs (user_id, pack_id, set_id, opened_at, cards, art, deleted, seq, game)
           SELECT user_id, id, set_id, ?3, cards, art, 0, (SELECT COALESCE(MAX(seq), 0) + 1 FROM packs WHERE user_id = ?1), game
           FROM pack_inventory WHERE user_id = ?1 AND id = ?2
           ON CONFLICT (user_id, pack_id) DO NOTHING`,
        )
        .bind(userId, dealId, new Date().toISOString()),
      db.prepare("DELETE FROM pack_inventory WHERE user_id = ? AND id = ?").bind(userId, dealId),
    ];
  }
  return [
    db
      .prepare(
        `INSERT INTO packs (user_id, pack_id, set_id, opened_at, cards, art, deleted, seq, game)
         SELECT user_id, deal_id, set_id, ?3, cards, art, 0, (SELECT COALESCE(MAX(seq), 0) + 1 FROM packs WHERE user_id = ?1), game
         FROM dealt_packs WHERE user_id = ?1 AND deal_id = ?2
         ON CONFLICT (user_id, pack_id) DO NOTHING`,
      )
      .bind(userId, dealId, new Date().toISOString()),
    db.prepare("DELETE FROM dealt_packs WHERE user_id = ? AND deal_id = ?").bind(userId, dealId),
  ];
}

export interface DealtRow {
  deal_id: string;
  set_id: string;
  cards: string;
  reveal: string;
  art: string | null;
}

function toPack(r: DealtRow): DealtPack {
  const cards = JSON.parse(r.cards) as SyncCard[];
  const reveal = JSON.parse(r.reveal) as Pick<DealtCard, "slot" | "outcome">[];
  return { dealId: r.deal_id, setId: r.set_id, art: r.art, cards: cards.map((c, i) => ({ ...c, ...reveal[i] })) };
}

const dealtPack = (ctx: Ctx, userId: string, game: Game) =>
  ctx.env.DB.prepare("SELECT deal_id, set_id, cards, reveal, art FROM dealt_packs WHERE user_id = ? AND game = ?").bind(userId, game).first<DealtRow>();

/** Each game has its own allowance. */
async function allowanceFor(ctx: Ctx, userId: string, game: Game) {
  const now = Date.now();
  // Deleted packs count too: throwing cards away doesn't give packs back. Bought packs don't: they cost coins instead.
  const { results } = await ctx.env.DB.prepare("SELECT opened_at FROM packs WHERE user_id = ? AND game = ? AND opened_at >= ? AND pack_id NOT LIKE ?")
    .bind(userId, game, new Date(now - ALLOWANCE_WINDOW_MS).toISOString(), `${SHOP_PACK_PREFIX}%`)
    .all<{ opened_at: string }>();
  return packAllowance(results.map((r) => Date.parse(r.opened_at)), now);
}

function parseDeal(env: Env, body: DealRequest | null): { game: Game; eras: string[]; opened?: string } {
  // Apps from before games don't say, and they're Pokémon.
  const game = requireGame(env, body?.game);
  // Each game has its own eras (Pokémon's pack profiles, Magic's booster eras, Yu-Gi-Oh!'s anime series).
  const known = new Set<string>((game === "mtg" ? MTG_ERAS : game === "ygo" ? YGO_ERAS : ERAS).map((e) => e.id));
  const eras = Array.isArray(body?.eras) ? body.eras.filter((e): e is string => typeof e === "string" && known.has(e)) : [];
  const opened = typeof body?.opened === "string" && body.opened.length <= 64 ? body.opened : undefined;
  return { game, eras, opened };
}

/**
 * The sets of a player's last dealt packs in a game, oldest first, for pity. Bought packs don't count: buying a pack
 * from a set you chose doesn't use up a guarantee.
 */
export async function pityHistory(ctx: Ctx, userId: string, game: Game): Promise<string[]> {
  const { results } = await ctx.env.DB.prepare("SELECT set_id FROM packs WHERE user_id = ? AND game = ? AND pack_id NOT LIKE ? ORDER BY opened_at DESC LIMIT ?")
    .bind(userId, game, `${SHOP_PACK_PREFIX}%`, HISTORY)
    .all<{ set_id: string }>();
  return results.map((r) => r.set_id).reverse();
}

async function deal(ctx: Ctx, userId: string): Promise<Response> {
  const { game, eras, opened } = parseDeal(ctx.env, await readJson<DealRequest | null>(ctx.req));
  const db = ctx.env.DB;
  if (opened) await db.batch(openStatements(db, userId, opened));

  const allowance = await allowanceFor(ctx, userId, game);
  const waiting = await dealtPack(ctx, userId, game);
  if (waiting) return json({ pack: toPack(waiting), allowance } satisfies DealResponse);
  if (allowance.left === 0) return json({ pack: null, allowance } satisfies DealResponse);

  const row =
    game === "mtg"
      ? await rollMtg(ctx, await pityHistory(ctx, userId, game), eras)
      : game === "ygo"
        ? await rollYgo(ctx, await pityHistory(ctx, userId, game), eras)
        : await rollPokemon(ctx, userId, eras);

  // Two tabs asking at once: the first one's pack wins, and both get it.
  await db
    .prepare("INSERT INTO dealt_packs (user_id, game, deal_id, set_id, cards, reveal, art, dealt_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, game) DO NOTHING")
    .bind(userId, game, row.deal_id, row.set_id, row.cards, row.reveal, row.art, Date.now())
    .run();
  const pack = (await dealtPack(ctx, userId, game)) ?? row;
  return json({ pack: toPack(pack), allowance } satisfies DealResponse);
}

/** Draws a Pokémon set (weighted by rarity, with pity) and rolls a pack from it. */
async function rollPokemon(ctx: Ctx, userId: string, eras: string[]): Promise<DealtRow> {
  const history = await pityHistory(ctx, userId, "pokemon");
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
    const rolled = await rollSet(ctx, set.id);
    if ("row" in rolled) return rolled.row;
    unopenable[set.id] = rolled.unopenable;
    await cache.set(UNOPENABLE_KEY, unopenable);
    avoid = set.id;
  }
  throw new HttpError(503, "No set could be opened. Check the era filter in Settings.");
}

/** Rolls a pack from one set, with a random pack art, or says why the set can't fill a pack. */
export async function rollSet(ctx: Ctx, setId: string): Promise<{ row: DealtRow; setName: string } | { unopenable: string }> {
  const { client } = tcgdex(ctx.env);
  let data;
  try {
    data = await client.getSetCards(setId);
  } catch (err) {
    console.error(`Couldn't load ${setId}`, err);
    throw new HttpError(503, "Couldn't reach the card database. Try again in a moment.");
  }
  const profile = profileFor(data.set);
  const reason = profile ? whyNotOpenable(data, profile) : "No pack profile for this series";
  if (!profile || reason) return { unopenable: reason ?? "Unopenable" };
  const pulls = openPack(data, profile, createRng(randomToken(16)));
  return {
    setName: data.set.name,
    row: {
      deal_id: crypto.randomUUID(),
      set_id: setId,
      cards: JSON.stringify(pulls.map((p): SyncCard => ({ cardId: p.card.id, localId: p.card.localId, finish: p.finish, firstEdition: p.firstEdition }))),
      reveal: JSON.stringify(pulls.map((p) => ({ slot: p.slot, outcome: p.outcome }))),
      art: pickPackArt(setId),
    },
  };
}
