// Magic: The Gathering data for the app, from Scryfall (a demo, off unless DEMO_GAMES lists "mtg"; see games.ts).
// - A set's cards are fetched once (two or three search pages) and kept in D1 (api_cache); the app caches them again
//   on the device. Scryfall asks that data be cached for at least a day, and set lists don't change after release.
// - Card images are sent on to cards.scryfall.io, which Scryfall allows linking to and doesn't rate limit.
// - Prices change daily, so they're kept apart from the cards: one entry per set per day, from the same search.

import type { CardWithSet, SetData, SetSummary } from "../src/api/types";
import { openPack, whyNotOpenable } from "../src/engine/openPack";
import { createRng } from "../src/engine/rng";
import type { CardPricing } from "../src/api/tcgdex";
import { fetchSetData, fetchSetPrices, inPacks, scryfallImage, searchCards, setSymbol, toCard, type RawCard } from "../src/mtg/cards";
import { mtgArt, mtgPickPackArt, WRAPPER_VERSION } from "../src/mtg/packArt";
import { renderWrapper } from "../src/mtg/wrapper";
import { pickRandomSet } from "../src/engine/randomSet";
import { pityFloor } from "../src/engine/setRarity";
import { boosterEra, MTG_ERAS, MTG_SETS, mtgDrawableSets, mtgProfile, mtgSet, mtgSetTier, type MtgSet } from "../src/mtg/sets";
import type { SyncCard } from "../src/sync/protocol";
import { d1Cache, pruneDailyEntries } from "./cache";
import { scryfall } from "./scryfall";
import { requireGame } from "./games";
import { HttpError, json, randomToken, type Ctx } from "./http";
import type { DealtRow } from "./packs";

/** Bump when the shape of stored set data changes (src/mtg/cards.ts), with the app's in src/mtg/client.ts. */
const SET_VERSION = 3;
const setKey = (id: string) => `mtg:set:${id}:v${SET_VERSION}`;

/** A set's cards, from D1, or from Scryfall the first time. */
export async function mtgSetData(env: Env, set: MtgSet): Promise<SetData> {
  const cache = d1Cache(env.DB);
  const hit = await cache.get<SetData>(setKey(set.id));
  if (hit) return hit;
  let data: SetData;
  try {
    data = await fetchSetData(set, scryfall(env));
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
        prices = await fetchSetPrices(set, scryfall(env));
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
const SUMMARIES_AT_ONCE = 3;
/** Summaries only count cards, so they're unaffected by SET_VERSION 3's oracle ids. */
const summariesKey = "mtg:sets:v2";

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
    // One set at a time, and none after a failure: Scryfall answers bursts with 429s (see scryfall.ts).
    for (const s of missing) {
      try {
        known[s.id] = toSummary(await mtgSetData(env, s));
      } catch (err) {
        console.error(`Couldn't summarise ${s.id}`, err);
        break;
      }
    }
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
 * GET /api/mtg/pack/v<version>/<set>/<design>.svg: a drawn pack wrapper (src/mtg/wrapper.ts).
 * GET /api/mtg/printings/<oracleId>: every printing of a card among the sets here (CardWithSet[], newest set first).
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

  if (kind === "pack") return wrapper(ctx);
  if (kind === "printings" && SCRYFALL_ID.test(id ?? "") && !file) {
    const res = json(await mtgPrintings(ctx.env, id));
    res.headers.set("Cache-Control", "public, max-age=3600");
    return res;
  }
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

/** Changes whenever MTG_SETS does, so a card's printings are looked up again when sets are added. */
const setsSignature = (() => {
  let h = 0;
  for (const c of MTG_SETS.map((s) => s.id).join(",")) h = (h * 31 + c.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
})();

/**
 * Every printing of a card (by Scryfall's oracle id) among the sets packs come from, newest set first. One Scryfall
 * search finds them however many sets there are; the answer is kept in D1 until the set list changes.
 */
export async function mtgPrintings(env: Env, oracleId: string): Promise<CardWithSet[]> {
  const cache = d1Cache(env.DB);
  const key = `mtg:printings:${oracleId}:v${SET_VERSION}:${setsSignature}`;
  const hit = await cache.get<CardWithSet[]>(key);
  if (hit) return hit;
  let raw: RawCard[];
  try {
    // Only the sets here: a basic land has been printed in hundreds, and every page of them is another request.
    raw = await searchCards(`oracleid:${oracleId} is:booster (${MTG_SETS.map((s) => `set:${s.id}`).join(" or ")})`, scryfall(env));
  } catch (err) {
    console.error(`Couldn't look up the printings of ${oracleId}`, err);
    throw new HttpError(503, "Couldn't reach the card database. Try again in a moment.");
  }
  const printings = raw
    .flatMap((c) => {
      const set = mtgSet(c.set ?? "");
      return set && inPacks(c) ? [{ set, card: { ...toCard(set.id, c), set: { id: set.id } } }] : [];
    })
    .sort((a, b) => b.set.released.localeCompare(a.set.released) || a.card.localId.localeCompare(b.card.localId, "en", { numeric: true }))
    .map((p) => p.card);
  await cache.set(key, printings);
  return printings;
}

const IMAGE_HEADERS = { "User-Agent": "TCGPackOpener/0.1 (+https://tcg.spudfurd.dev)" };

/** A file's bytes as base64, for a data URI. */
function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function dataUri(url: string, type: string): Promise<string> {
  const res = await fetch(url, { headers: IMAGE_HEADERS });
  if (!res.ok) throw new HttpError(502, `Couldn't load ${url} (${res.status}).`);
  return `data:${type};base64,${base64(new Uint8Array(await res.arrayBuffer()))}`;
}

/**
 * A drawn pack wrapper: the design's card art and the set symbol, fetched from Scryfall and inlined. The path carries
 * WRAPPER_VERSION, so a wrapper never changes at its URL and can be cached for good, by browsers and Cloudflare.
 */
async function wrapper(ctx: Ctx): Promise<Response> {
  const [, , , , version, setId, file] = ctx.url.pathname.split("/");
  const set = mtgSet(setId ?? "");
  const art = set && file?.endsWith(".svg") ? mtgArt(set.id, decodeURIComponent(file.slice(0, -4))) : undefined;
  if (version !== `v${WRAPPER_VERSION}` || !set || !art) throw new HttpError(404, "No such pack");

  const cache = typeof caches === "undefined" ? undefined : caches.default;
  const hit = await cache?.match(ctx.req.url);
  if (hit) return hit;
  const [artUri, symbolUri] = await Promise.all([dataUri(scryfallImage(art.scryfallId, "art_crop"), "image/jpeg"), dataUri(setSymbol(set.id), "image/svg+xml")]);
  const svg = renderWrapper({ era: boosterEra(set), setId: set.id, setName: set.name, cardName: art.name, art: artUri, symbol: symbolUri });
  const res = new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=31536000, immutable" } });
  await cache?.put(ctx.req.url, res.clone());
  return res;
}

/**
 * Rolls a Magic pack from a random set, as Pokémon's are: limited to the player's booster eras, weighted by how scarce
 * each set is (mtgSetTier), and at least the tier a pity guarantee calls for, going by `history` (the sets of their
 * last dealt packs, oldest first). A set that can't fill a pack is dropped and another drawn.
 */
export async function rollMtg(ctx: Ctx, history: string[], eras: string[]): Promise<DealtRow> {
  const sets = [...mtgDrawableSets(eras)];
  const floor = pityFloor(history, mtgSetTier);
  while (sets.length) {
    const set = pickRandomSet(sets, Math.random, { floor, tierOf: mtgSetTier })!;
    sets.splice(sets.indexOf(set), 1);
    const rolled = await rollMtgSet(ctx, set);
    if ("row" in rolled) return rolled.row;
    console.warn(`Can't open ${set.id}: ${rolled.unopenable}`);
  }
  throw new HttpError(503, "No set could be opened.");
}

/** Rolls a pack from one Magic set (the shop's, where the player picks it), or says why the set can't fill a pack. */
export async function rollMtgSet(ctx: Ctx, set: MtgSet): Promise<{ row: DealtRow; setName: string } | { unopenable: string }> {
  const data = await mtgSetData(ctx.env, set);
  const profile = mtgProfile(set);
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
      // Which design its wrapper is (packArt.ts), kept with the pack.
      art: mtgPickPackArt(set.id),
    },
  };
}
