// YGOPRODeck for the Yu-Gi-Oh! scripts: a set's cards, cached on disk for the day (.cache) and fetched politely.
// YGOPRODeck blocks an IP for an hour past 20 requests a second, so requests go a quarter of a second apart.
import { fetchRawCards, type RawCard } from "../src/ygo/cards";
import type { YgoSet } from "../src/ygo/sets";
import { fileCache } from "./fileCache";

const cache = fileCache();
export const today = new Date().toISOString().slice(0, 10);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let last = 0;
/** fetch, at most four a second. */
export async function politeFetch(url: string, init?: RequestInit): Promise<Response> {
  const gap = last + 250 - Date.now();
  if (gap > 0) await wait(gap);
  last = Date.now();
  return fetch(url, init);
}

/** Today's YGOPRODeck data for a set's cards (cards and prices both come from it). */
export async function rawCards(set: YgoSet): Promise<RawCard[]> {
  const key = `ygoprodeck:${set.id}:${today}`;
  const hit = await cache.get<RawCard[]>(key);
  if (hit) return hit;
  const raw = await fetchRawCards(set, politeFetch);
  await cache.set(key, raw);
  return raw;
}
