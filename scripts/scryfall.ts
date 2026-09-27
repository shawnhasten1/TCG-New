// Scryfall for the Magic scripts: a set's booster cards, cached on disk for the day (.cache) and fetched politely.
// Scryfall asks for requests to be spaced out and answers bursts with 429s (asking for 10–15 seconds' rest), so sets
// are fetched a second apart and a 429 is waited out a few times before giving up.
import { fetchRawCards, type RawCard } from "../src/mtg/cards";
import type { MtgSet } from "../src/mtg/sets";
import { fileCache } from "./fileCache";

const cache = fileCache();
export const today = new Date().toISOString().slice(0, 10);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Today's Scryfall data for a set's booster cards (cards and prices both come from it). */
export async function rawCards(set: MtgSet): Promise<RawCard[]> {
  const key = `scryfall:${set.id}:${today}`;
  const hit = await cache.get<RawCard[]>(key);
  if (hit) return hit;
  for (let attempt = 1; ; attempt++) {
    try {
      const raw = await fetchRawCards(set);
      await cache.set(key, raw);
      await wait(1000);
      return raw;
    } catch (err) {
      if (attempt >= 4 || !String(err).includes("429")) throw err;
      console.log(`Scryfall asked to slow down; waiting before ${set.name}…`);
      await wait(20_000);
    }
  }
}
