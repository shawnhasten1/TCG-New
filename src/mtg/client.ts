// Magic set data and prices in the app: from the Worker (which keeps Scryfall's data, worker/mtg.ts), cached on the device.

import type { CardPricing } from "../api/tcgdex";
import type { CardWithSet, SetData, SetSummary } from "../api/types";
import { cache } from "../app/client";

/** Bump with the Worker's SET_VERSION. */
const key = (id: string) => `mtg:set:${id}:v3`;

export async function getMtgSet(id: string): Promise<SetData> {
  const hit = await cache.get<SetData>(key(id));
  if (hit) return hit;
  const res = await fetch(`/api/mtg/set/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Couldn't load the set (${res.status}).`);
  const data = (await res.json()) as SetData;
  await cache.set(key(id), data);
  return data;
}

/** Drops a set's cached cards, so the next getMtgSet fetches them fresh. */
export const forgetMtgSet = (id: string) => cache.delete(key(id));

let setsLoading: Promise<SetSummary[]> | undefined;

/** Every Magic set, as the set list shows it. Kept for the day once the Worker has every set's card counts. */
export function getMtgSets(): Promise<SetSummary[]> {
  setsLoading ??= (async () => {
    const key = `mtg:sets:${today()}`;
    const hit = await cache.get<SetSummary[]>(key);
    if (hit) return hit;
    const res = await fetch("/api/mtg/sets");
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Couldn't load the sets (${res.status}).`);
    const sets = (await res.json()) as SetSummary[];
    if (sets.every((s) => s.cardCount.total)) await cache.set(key, sets);
    return sets;
  })().finally(() => (setsLoading = undefined));
  return setsLoading;
}

const today = () => new Date().toISOString().slice(0, 10);
const pricesKey = (setId: string, day: string) => `mtg:prices:${setId}:${day}`;
/** A card's set: ids are "<set code>-<collector number>", and set codes have no hyphen. */
const setOf = (cardId: string) => cardId.slice(0, cardId.indexOf("-"));
/** Sets whose prices are loading, so a page asking for many of a set's cards fetches the set once. */
const loading = new Map<string, Promise<Record<string, CardPricing>>>();

/** Today's prices for a set's cards, by card id. The Worker prices a whole set at once, so this does too. */
function getMtgPrices(setId: string): Promise<Record<string, CardPricing>> {
  const key = pricesKey(setId, today());
  let got = loading.get(key);
  if (!got) {
    got = (async () => {
      const hit = await cache.get<Record<string, CardPricing>>(key);
      if (hit) return hit;
      const res = await fetch(`/api/mtg/prices/${encodeURIComponent(setId)}`);
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Couldn't load prices (${res.status}).`);
      const prices = (await res.json()) as Record<string, CardPricing>;
      await cache.set(key, prices);
      return prices;
    })().finally(() => loading.delete(key));
    loading.set(key, got);
  }
  return got;
}

/** Today's prices for one Magic card, or null if it has none. Matches client.getCardPricing for Pokémon. */
export const getMtgCardPricing = async (id: string): Promise<CardPricing | null> => (await getMtgPrices(setOf(id)))[id] ?? null;

/** Today's prices already on the device for any of `ids`, without fetching the rest. Matches client.cachedCardPricing. */
export async function cachedMtgCardPricing(ids: string[]): Promise<Map<string, CardPricing | null>> {
  const out = new Map<string, CardPricing | null>();
  const day = today();
  for (const setId of new Set(ids.map(setOf))) {
    const prices = await cache.get<Record<string, CardPricing>>(pricesKey(setId, day));
    if (prices) for (const id of ids) if (setOf(id) === setId) out.set(id, prices[id] ?? null);
  }
  return out;
}

/** Every printing of a card among the sets here, newest set first (worker/mtg.ts). Kept for the day. */
export async function getMtgPrintings(oracleId: string): Promise<CardWithSet[]> {
  const key = `mtg:printings:${oracleId}:${today()}`;
  const hit = await cache.get<CardWithSet[]>(key);
  if (hit) return hit;
  const res = await fetch(`/api/mtg/printings/${encodeURIComponent(oracleId)}`);
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Couldn't load the printings (${res.status}).`);
  const printings = (await res.json()) as CardWithSet[];
  await cache.set(key, printings);
  return printings;
}
