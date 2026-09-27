// Magic: The Gathering data for the app, from Scryfall (a demo, off unless DEMO_GAMES lists "mtg"; see games.ts).
// - A set's cards are fetched once (two or three search pages) and kept in D1 (api_cache); the app caches them again
//   on the device. Scryfall asks that data be cached for at least a day, and set lists don't change after release.
// - Card images are sent on to cards.scryfall.io, which Scryfall allows linking to and doesn't rate limit.
// - Prices change daily, so they're kept apart from the cards: one entry per set per day, from the same search.

import type { SetData, SetSummary } from "../src/api/types";
import { openPack, whyNotOpenable } from "../src/engine/openPack";
import { createRng } from "../src/engine/rng";
import type { CardPricing } from "../src/api/tcgdex";
import { fetchSetData, fetchSetPrices, scryfallImage, setSymbol } from "../src/mtg/cards";
import { boosterEra, MTG_ERAS, MTG_SETS, mtgProfile, mtgSet, type MtgSet } from "../src/mtg/sets";
import type { SyncCard } from "../src/sync/protocol";
import { d1Cache, pruneDailyEntries } from "./cache";
import { requireGame } from "./games";
import { HttpError, json, randomToken, type Ctx } from "./http";
import type { DealtRow } from "./packs";

/** Bump when the shape of stored set data changes (src/mtg/cards.ts), with the app's in src/mtg/client.ts. */
const SET_VERSION = 2;
const setKey = (id: string) => `mtg:set:${id}:v${SET_VERSION}`;

/** A set's cards, from D1, or from Scryfall the first time. */
export async function mtgSetData(env: Env, set: MtgSet): Promise<SetData> {
  const cache = d1Cache(env.DB);
  const hit = await cache.get<SetData>(setKey(set.id));
  if (hit) return hit;
  let data: SetData;
  try {
    data = await fetchSetData(set);
  } catch (err) {
    console.error(`Couldn't load ${set.name} from Scryfall`, err);
    throw new HttpError(503, "Couldn't reach the card database. Try again in a moment.");
  }
  await cache.set(setKey(set.id), data);
  return data;
}

const today = () => new Date().toISOString().slice(0, 10);
/** Ends in the day, so pruneDailyEntries clears it out once it's past. */
const pricesKey = (id: string, day: string) => `mtg:prices:${id}:${day}`;
/** Sets whose prices are being fetched in this isolate, so a burst of requests fetches once. */
const pricing = new Map<string, Promise<Record<string, CardPricing>>>();

/** Today's prices for a set's cards, by card id (cards with none are left out). From D1, or Scryfall once a day. */
export function mtgSetPrices(env: Env, set: MtgSet): Promise<Record<string, CardPricing>> {
  const key = pricesKey(set.id, today());
  let got = pricing.get(key);
  if (!got) {
    got = (async () => {
      const cache = d1Cache(env.DB);
      const hit = await cache.get<Record<string, CardPricing>>(key);
      if (hit) return hit;
      let prices: Record<string, CardPricing>;
      try {
        prices = await fetchSetPrices(set);
      } catch (err) {
        console.error(`Couldn't load prices for ${set.name} from Scryfall`, err);
        throw new HttpError(503, "Couldn't reach the price database. Try again in a moment.");
      }
      await cache.set(key, prices);
      // A new day's first fetch: tidy away past days' entries while we're here.
      await pruneDailyEntries(env.DB);
      return prices;
    })().finally(() => pricing.delete(key));
    pricing.set(key, got);
  }
  return got;
}

/** Sets read (or fetched from Scryfall) per request to fill in the set list, so no request makes too many calls. */
const SUMMARIES_AT_ONCE = 5;
const summariesKey = `mtg:sets:v${SET_VERSION}`;

/**
 * Every Magic set as the set list shows it (SetSummary), with card counts from each set's data. Scryfall's own set
 * list won't do: newer sets have no printed size, and older ones count basic lands. So each set's summary is worked
 * out from its cards and kept in D1, a few sets per request; the rest come back with no counts (0) until then.
 */
export async function mtgSetSummaries(env: Env): Promise<SetSummary[]> {
  const cache = d1Cache(env.DB);
  const known = (await cache.get<Record<string, SetSummary>>(summariesKey)) ?? {};
  const missing = MTG_SETS.filter((s) => !known[s.id]).slice(0, SUMMARIES_AT_ONCE);
  if (missing.length) {
    const got = await Promise.all(missing.map((s) => mtgSetData(env, s).then(toSummary, (err) => (console.error(`Couldn't summarise ${s.id}`, err), undefined))));
    for (const s of got) if (s) known[s.id] = s;
    await cache.set(summariesKey, known);
  }
  return MTG_SETS.map((s) => known[s.id] ?? toSummary({ set: { id: s.id, name: s.name, releaseDate: s.released, cardCount: { total: 0, official: 0 } } }));
}

/** A set's summary. Its serie is its booster era, which is how the set list groups Magic sets. */
function toSummary(data: { set: Pick<SetData["set"], "id" | "name" | "releaseDate" | "cardCount"> }): SetSummary {
  const set = mtgSet(data.set.id)!;
  const era = boosterEra(set);
  return {
    id: set.id,
    name: set.name,
    logo: null,
    symbol: setSymbol(set.id),
    releaseDate: set.released,
    serie: { id: `mtg-${era}`, name: MTG_ERAS.find((e) => e.id === era)!.name },
    cardCount: { total: data.set.cardCount.total, official: data.set.cardCount.official },
  };
}

const SCRYFALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * GET /api/mtg/sets: every set, as the set list shows it (SetSummary[]; see mtgSetSummaries).
 * GET /api/mtg/set/<id>: a set's cards (SetData).
 * GET /api/mtg/prices/<id>: today's prices for a set's cards, by card id (Record<string, CardPricing>).
 * GET /api/mtg/card/<scryfallId>/<high|low>.webp: redirects to the card's image on Scryfall. The name matches
 *   TCGdex's image URLs, so the app shows every game's cards the same way, but it's the JPEG Scryfall serves.
 */
export async function handleMtg(ctx: Ctx): Promise<Response> {
  requireGame(ctx.env, "mtg");
  if (ctx.req.method !== "GET" && ctx.req.method !== "HEAD") throw new HttpError(405, "Method not allowed");
  const [, , , kind, id, file] = ctx.url.pathname.split("/");

  if (kind === "sets" && !id) {
    const sets = await mtgSetSummaries(ctx.env);
    const res = json(sets);
    // Only a complete list is worth keeping; an incomplete one fills in over the next few requests.
    res.headers.set("Cache-Control", sets.every((s) => s.cardCount.total) ? "public, max-age=3600" : "no-store");
    return res;
  }
  if (kind === "set" && !file) {
    const set = mtgSet(id ?? "");
    if (!set) throw new HttpError(404, "No such set");
    const res = json(await mtgSetData(ctx.env, set));
    res.headers.set("Cache-Control", "public, max-age=3600");
    return res;
  }
  if (kind === "prices" && !file) {
    const set = mtgSet(id ?? "");
    if (!set) throw new HttpError(404, "No such set");
    const res = json(await mtgSetPrices(ctx.env, set));
    res.headers.set("Cache-Control", "public, max-age=3600");
    return res;
  }
  if (kind === "card" && SCRYFALL_ID.test(id ?? "") && (file === "high.webp" || file === "low.webp")) {
    return new Response(null, {
      status: 302,
      headers: { Location: scryfallImage(id, file === "high.webp" ? "large" : "normal"), "Cache-Control": "public, max-age=86400" },
    });
  }
  throw new HttpError(404, "Not found");
}

/** Rolls a Magic pack from a random set. */
export async function rollMtg(ctx: Ctx): Promise<DealtRow> {
  const sets = [...MTG_SETS];
  while (sets.length) {
    const [set] = sets.splice(Math.floor(Math.random() * sets.length), 1);
    const data = await mtgSetData(ctx.env, set);
    const profile = mtgProfile(set);
    const reason = whyNotOpenable(data, profile);
    if (reason) {
      console.warn(`Can't open ${set.id}: ${reason}`);
      continue;
    }
    const pulls = openPack(data, profile, createRng(randomToken(16)));
    return {
      deal_id: crypto.randomUUID(),
      set_id: set.id,
      cards: JSON.stringify(pulls.map((p): SyncCard => ({ cardId: p.card.id, localId: p.card.localId, finish: p.finish, firstEdition: p.firstEdition }))),
      reveal: JSON.stringify(pulls.map((p) => ({ slot: p.slot, outcome: p.outcome }))),
      art: null,
    };
  }
  throw new HttpError(503, "No set could be opened.");
}
