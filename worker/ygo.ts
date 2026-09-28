// Yu-Gi-Oh! data for the app, from YGOPRODeck (a demo, off unless DEMO_GAMES lists "ygo"; see games.ts). Its terms ask
// that data be stored rather than fetched again and that images be re-hosted, never hotlinked, and it blocks an IP for
// an hour past 20 requests a second. So:
// - a set's cards are fetched once and kept in D1 (api_cache), and the app caches them again on the device;
// - prices change daily, so they're kept apart from the cards: one entry per set per day, from the same request;
// - card images are fetched once into R2 (YGO_IMAGES) and served from there, cached for good by browsers (pack
//   wrappers are in the app itself, public/packs/ygo);
// - requests to YGOPRODeck go through rate limits under theirs (YGOPRODECK_LIMITER, and YGO_IMAGE_LIMITER for the
//   bursts of images a first look at a binder brings). Past one, a request is turned away with a 503 rather than
//   queued (a promise from another request's context can't be awaited in a Worker), and the app tries again later.

import type { CardPricing } from "../src/api/tcgdex";
import type { CardWithSet, SetData, SetSummary } from "../src/api/types";
import { openPack, whyNotOpenable } from "../src/engine/openPack";
import { pickRandomSet } from "../src/engine/randomSet";
import { createRng } from "../src/engine/rng";
import { pityFloor } from "../src/engine/setRarity";
import type { SyncCard } from "../src/sync/protocol";
import { cardImageBase, fetchSetData, fetchSetPrices, type Fetcher } from "../src/ygo/cards";
import { ygoPickPackArt } from "../src/ygo/packArt";
import { YGO_ERAS, YGO_SETS, YGO_SETS_SIGNATURE, ygoDrawableSets, ygoEra, ygoProfile, ygoSet, ygoSetTier, type YgoSet } from "../src/ygo/sets";
import { d1Cache, pruneDailyEntries } from "./cache";
import { requireGame } from "./games";
import { HttpError, json, randomToken, type Ctx } from "./http";
import type { DealtRow } from "./packs";

/** Bump when the shape of stored set data changes (src/ygo/cards.ts), with the app's in src/ygo/client.ts. */
const SET_VERSION = 2;
const setKey = (id: string) => `ygo:set:${id}:v${SET_VERSION}`;

/** A fetch that keeps to YGOPRODeck's limits: turned away (503) past YGOPRODECK_LIMITER (or, for images, YGO_IMAGE_LIMITER). */
function ygoprodeck(env: Env, limiter: RateLimit = env.YGOPRODECK_LIMITER): Fetcher {
  return async (url, init) => {
    const { success } = await limiter.limit({ key: "ygoprodeck" });
    if (!success) throw new HttpError(503, "The card database is busy. Try again in a moment.");
    return fetch(url, init);
  };
}

/* ---------- Set data and prices ---------- */

/** A set's cards, from D1, or from YGOPRODeck the first time. */
export async function ygoSetData(env: Env, set: YgoSet): Promise<SetData> {
  const cache = d1Cache(env.DB);
  const hit = await cache.get<SetData>(setKey(set.id));
  if (hit) return hit;
  let data: SetData;
  try {
    data = await fetchSetData(set, ygoprodeck(env));
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.error(`Couldn't load ${set.name} from YGOPRODeck`, err);
    throw new HttpError(503, "Couldn't reach the card database. Try again in a moment.");
  }
  await cache.set(setKey(set.id), data);
  return data;
}

const today = () => new Date().toISOString().slice(0, 10);
/** Ends in the day, so pruneDailyEntries clears it out once it's past. */
const pricesKey = (id: string, day: string) => `ygo:prices:${id}:${day}`;
/** Sets whose prices are being fetched in this isolate, so a burst of requests fetches once. */
const pricing = new Map<string, Promise<Record<string, CardPricing>>>();

/** Today's prices for a set's cards, by card id (cards with none are left out). From D1, or YGOPRODeck once a day. */
export function ygoSetPrices(env: Env, set: YgoSet): Promise<Record<string, CardPricing>> {
  const key = pricesKey(set.id, today());
  let got = pricing.get(key);
  if (!got) {
    got = (async () => {
      const cache = d1Cache(env.DB);
      const hit = await cache.get<Record<string, CardPricing>>(key);
      if (hit) return hit;
      let prices: Record<string, CardPricing>;
      try {
        prices = await fetchSetPrices(set, ygoprodeck(env));
      } catch (err) {
        if (err instanceof HttpError) throw err;
        console.error(`Couldn't load prices for ${set.name} from YGOPRODeck`, err);
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

/* ---------- The set list ---------- */

/** Sets read (or fetched from YGOPRODeck) per request to fill in the set list, so no request makes too many calls. */
const SUMMARIES_AT_ONCE = 5;
const summariesKey = `ygo:sets:v${SET_VERSION}`;

/**
 * Every Yu-Gi-Oh! set as the set list shows it (SetSummary), with card counts from each set's data (YGOPRODeck's own
 * counts include every regional printing). Kept in D1, filled in a few sets per request; the rest come back with no
 * counts (0) until then.
 */
export async function ygoSetSummaries(env: Env): Promise<SetSummary[]> {
  const cache = d1Cache(env.DB);
  const known = (await cache.get<Record<string, SetSummary>>(summariesKey)) ?? {};
  const missing = YGO_SETS.filter((s) => !known[s.id]).slice(0, SUMMARIES_AT_ONCE);
  if (missing.length) {
    for (const s of missing) {
      try {
        known[s.id] = toSummary(s, await ygoSetData(env, s));
      } catch (err) {
        console.error(`Couldn't summarise ${s.id}`, err);
        break;
      }
    }
    await cache.set(summariesKey, known);
  }
  return YGO_SETS.map((s) => known[s.id] ?? toSummary(s));
}

/** A set's summary. Its serie is its era, which is how the set list groups Yu-Gi-Oh! sets. */
function toSummary(set: YgoSet, data?: SetData): SetSummary {
  const era = ygoEra(set);
  return {
    id: set.id,
    name: set.name,
    logo: null,
    symbol: null,
    releaseDate: set.released,
    serie: { id: `ygo-${era}`, name: YGO_ERAS.find((e) => e.id === era)!.name },
    cardCount: data ? data.set.cardCount : { total: 0, official: 0 },
  };
}

/* ---------- Every printing of a card ---------- */

/**
 * Every printing of a card (by passcode) among the sets packs come from, newest set first. YGOPRODeck lists a card's
 * printings on the card, so one request finds them all; the answer is kept in D1 until the set list changes. Printings
 * in sets not yet in D1 are left out rather than fetching each set.
 */
export async function ygoPrintings(env: Env, passcode: number): Promise<CardWithSet[]> {
  const cache = d1Cache(env.DB);
  const key = `ygo:printings:${passcode}:v${SET_VERSION}:${YGO_SETS_SIGNATURE}`;
  const hit = await cache.get<CardWithSet[]>(key);
  if (hit) return hit;
  let res: Response;
  try {
    res = await ygoprodeck(env)(`https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${passcode}`);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.error(`Couldn't look up the printings of ${passcode}`, err);
    throw new HttpError(503, "Couldn't reach the card database. Try again in a moment.");
  }
  if (res.status === 400) throw new HttpError(404, "No such card");
  if (!res.ok) throw new HttpError(503, "Couldn't reach the card database. Try again in a moment.");
  const { data } = (await res.json()) as { data?: { card_sets?: { set_code: string }[] }[] };
  const setIds = [...new Set((data?.[0]?.card_sets ?? []).map((p) => p.set_code.slice(0, p.set_code.indexOf("-"))))].filter((id) => ygoSet(id));
  const sets = await Promise.all(setIds.map((id) => ygoSetData(env, ygoSet(id)!)));
  const printings = sets
    .sort((a, b) => (b.set.releaseDate ?? "").localeCompare(a.set.releaseDate ?? ""))
    .flatMap((data) => data.cards.filter((c) => c.passcode === passcode).map((c): CardWithSet => ({ ...c, set: { id: data.set.id } })));
  await cache.set(key, printings);
  return printings;
}

/* ---------- Images ---------- */

const IMAGES = "https://images.ygoprodeck.com/images";

/** An image from R2, or from YGOPRODeck the first time (then kept in R2). */
async function rehosted(env: Env, key: string, url: string): Promise<Response> {
  const headers = { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable" };
  const stored = await env.YGO_IMAGES.get(key);
  if (stored) return new Response(stored.body, { headers });
  const res = await ygoprodeck(env, env.YGO_IMAGE_LIMITER)(url);
  if (!res.ok) throw new HttpError(res.status === 404 ? 404 : 502, `Couldn't fetch the image (${res.status}).`);
  const body = await res.arrayBuffer();
  await env.YGO_IMAGES.put(key, body, { httpMetadata: { contentType: "image/jpeg" } });
  return new Response(body, { headers });
}

/* ---------- Routes ---------- */

/**
 * GET /api/ygo/sets: every set, as the set list shows it (SetSummary[]; see ygoSetSummaries).
 * GET /api/ygo/set/<id>: a set's cards (SetData).
 * GET /api/ygo/prices/<id>: today's prices for a set's cards, by card id (Record<string, CardPricing>).
 * GET /api/ygo/printings/<passcode>: every printing of a card among the sets here (CardWithSet[], newest set first).
 * GET /api/ygo/card/<setId>/<passcode>/<high|low>.webp: a card's image. The name matches TCGdex's image URLs, so
 *   the app shows every game's cards the same way, but it's the JPEG YGOPRODeck serves. Only cards in that set.
 */
export async function handleYgo(ctx: Ctx): Promise<Response> {
  requireGame(ctx.env, "ygo");
  if (ctx.req.method !== "GET" && ctx.req.method !== "HEAD") throw new HttpError(405, "Method not allowed");
  const [, , , kind, id, passcode, file] = ctx.url.pathname.split("/");

  if (kind === "sets" && !id) {
    const sets = await ygoSetSummaries(ctx.env);
    const res = json(sets);
    // Only a complete list is worth keeping; an incomplete one fills in over the next few requests.
    res.headers.set("Cache-Control", sets.every((s) => s.cardCount.total) ? "public, max-age=3600" : "no-store");
    return res;
  }
  if (kind === "printings" && /^\d{1,10}$/.test(id ?? "") && !passcode) {
    const res = json(await ygoPrintings(ctx.env, Number(id)));
    res.headers.set("Cache-Control", "public, max-age=3600");
    return res;
  }
  const set = ygoSet(id ?? "");
  if (!set) throw new HttpError(404, "No such set");

  if (kind === "set" && !passcode) {
    const res = json(await ygoSetData(ctx.env, set));
    res.headers.set("Cache-Control", "public, max-age=3600");
    return res;
  }
  if (kind === "prices" && !passcode) {
    const res = json(await ygoSetPrices(ctx.env, set));
    res.headers.set("Cache-Control", "public, max-age=3600");
    return res;
  }
  if (kind === "card" && /^\d{1,10}$/.test(passcode ?? "") && (file === "high.webp" || file === "low.webp")) {
    // Only this set's cards, so the route can't be used to pull arbitrary images through.
    const data = await ygoSetData(ctx.env, set);
    const base = cardImageBase(set.id, Number(passcode));
    if (!data.cards.some((c) => c.image === base)) throw new HttpError(404, "No such card in this set");
    // Both are the full scan (813×1185): YGOPRODeck's small one is 168 px wide, blurry even in a pack summary, and
    // one image per card means one download from YGOPRODeck per card.
    return rehosted(ctx.env, `cards/${passcode}.jpg`, `${IMAGES}/cards/${passcode}.jpg`);
  }
  throw new HttpError(404, "Not found");
}

/* ---------- Dealing ---------- */

/**
 * Rolls a Yu-Gi-Oh! pack from a random set, as Pokémon's are: limited to the player's eras, weighted by how scarce
 * each set is (ygoSetTier), and at least the tier a pity guarantee calls for, going by `history` (the sets of their
 * last dealt packs, oldest first). A set that can't fill a pack is dropped and another drawn.
 */
export async function rollYgo(ctx: Ctx, history: string[], eras: string[]): Promise<DealtRow> {
  const sets = [...ygoDrawableSets(eras)];
  const floor = pityFloor(history, ygoSetTier);
  while (sets.length) {
    const set = pickRandomSet(sets, Math.random, { floor, tierOf: ygoSetTier })!;
    sets.splice(sets.indexOf(set), 1);
    const rolled = await rollYgoSet(ctx, set);
    if ("row" in rolled) return rolled.row;
    console.warn(`Can't open ${set.id}: ${rolled.unopenable}`);
  }
  throw new HttpError(503, "No set could be opened.");
}

/** Rolls a pack from one Yu-Gi-Oh! set (the shop's, where the player picks it), or says why the set can't fill a pack. */
export async function rollYgoSet(ctx: Ctx, set: YgoSet): Promise<{ row: DealtRow; setName: string } | { unopenable: string }> {
  const data = await ygoSetData(ctx.env, set);
  const profile = ygoProfile(set);
  const reason = whyNotOpenable(data, profile);
  if (reason) return { unopenable: reason };
  const pulls = openPack(data, profile, createRng(randomToken(16)));
  return {
    setName: set.name,
    row: {
      deal_id: crypto.randomUUID(),
      set_id: set.id,
      cards: JSON.stringify(pulls.map((p): SyncCard => ({ cardId: p.card.id, localId: p.card.localId, finish: p.finish, firstEdition: p.firstEdition }))),
      reveal: JSON.stringify(pulls.map((p) => ({ slot: p.slot, outcome: p.outcome }))),
      art: ygoPickPackArt(set.id),
    },
  };
}
