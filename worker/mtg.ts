// Magic: The Gathering data for the app, from Scryfall (a demo, off unless DEMO_GAMES lists "mtg"; see games.ts).
// - A set's cards are fetched once (two or three search pages) and kept in D1 (api_cache); the app caches them again
//   on the device. Scryfall asks that data be cached for at least a day, and set lists don't change after release.
// - Card images are sent on to cards.scryfall.io, which Scryfall allows linking to and doesn't rate limit.

import type { SetData } from "../src/api/types";
import { openPack, whyNotOpenable } from "../src/engine/openPack";
import { createRng } from "../src/engine/rng";
import { fetchSetData, scryfallImage } from "../src/mtg/cards";
import { MTG_SETS, mtgProfile, mtgSet, type MtgSet } from "../src/mtg/sets";
import type { SyncCard } from "../src/sync/protocol";
import { d1Cache } from "./cache";
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

const SCRYFALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * GET /api/mtg/set/<id>: a set's cards (SetData).
 * GET /api/mtg/card/<scryfallId>/<high|low>.webp: redirects to the card's image on Scryfall. The name matches
 *   TCGdex's image URLs, so the app shows every game's cards the same way, but it's the JPEG Scryfall serves.
 */
export async function handleMtg(ctx: Ctx): Promise<Response> {
  requireGame(ctx.env, "mtg");
  if (ctx.req.method !== "GET" && ctx.req.method !== "HEAD") throw new HttpError(405, "Method not allowed");
  const [, , , kind, id, file] = ctx.url.pathname.split("/");

  if (kind === "set" && !file) {
    const set = mtgSet(id ?? "");
    if (!set) throw new HttpError(404, "No such set");
    const res = json(await mtgSetData(ctx.env, set));
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
