// Set data, prices and printings in the app for the games whose card data the Worker keeps (Magic's from Scryfall,
// worker/mtg.ts; Yu-Gi-Oh!'s from YGOPRODeck, worker/ygo.ts), cached on the device. Each game's Worker routes are
// the same under its own prefix (/api/mtg/, /api/ygo/).

import type { CardPricing } from "../api/tcgdex";
import type { CardWithSet, SetData, SetSummary } from "../api/types";
import { cache } from "./client";

export interface WorkerCards {
  getSet(id: string): Promise<SetData>;
  /** Drops a set's cached cards, so the next getSet fetches them fresh. */
  forgetSet(id: string): Promise<void>;
  /** Every set, as the set list shows it. */
  getSets(): Promise<SetSummary[]>;
  /** Today's prices for one card, or null if it has none. Matches client.getCardPricing for Pokémon. */
  getCardPricing(id: string): Promise<CardPricing | null>;
  /** Today's prices already on the device for any of `ids`, without fetching the rest. Matches client.cachedCardPricing. */
  cachedCardPricing(ids: string[]): Promise<Map<string, CardPricing | null>>;
  /** Every printing of a card among the sets here, newest set first. Kept for the day, or until sets are added. */
  getPrintings(key: string | number): Promise<CardWithSet[]>;
}

interface Options {
  /** The Worker's route prefix and the device cache's key prefix, e.g. "mtg". */
  prefix: string;
  /** The Worker's SET_VERSION: bump them together. */
  setVersion: number;
  /** Changes when sets are added, so the set list and printings refresh (in the device cache and the browser's). */
  signature: string;
  /** A card's set, from its id. */
  setOf(cardId: string): string;
}

const today = () => new Date().toISOString().slice(0, 10);

async function getJson<T>(url: string, what: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Couldn't load ${what} (${res.status}).`);
  return (await res.json()) as T;
}

export function workerCards({ prefix, setVersion, signature, setOf }: Options): WorkerCards {
  const setKey = (id: string) => `${prefix}:set:${id}:v${setVersion}`;
  const pricesKey = (setId: string, day: string) => `${prefix}:prices:${setId}:${day}`;
  let setsLoading: Promise<SetSummary[]> | undefined;
  /** Sets whose prices are loading, so a page asking for many of a set's cards fetches the set once. */
  const loading = new Map<string, Promise<Record<string, CardPricing>>>();

  /** Today's prices for a set's cards, by card id. The Worker prices a whole set at once, so this does too. */
  function getPrices(setId: string): Promise<Record<string, CardPricing>> {
    const key = pricesKey(setId, today());
    let got = loading.get(key);
    if (!got) {
      got = (async () => {
        const hit = await cache.get<Record<string, CardPricing>>(key);
        if (hit) return hit;
        const prices = await getJson<Record<string, CardPricing>>(`/api/${prefix}/prices/${encodeURIComponent(setId)}`, "prices");
        await cache.set(key, prices);
        return prices;
      })().finally(() => loading.delete(key));
      loading.set(key, got);
    }
    return got;
  }

  return {
    async getSet(id) {
      const hit = await cache.get<SetData>(setKey(id));
      if (hit) return hit;
      const data = await getJson<SetData>(`/api/${prefix}/set/${encodeURIComponent(id)}`, "the set");
      await cache.set(setKey(id), data);
      return data;
    },

    forgetSet: (id) => cache.delete(setKey(id)),

    // Kept for the day once the Worker has every set's card counts.
    getSets() {
      setsLoading ??= (async () => {
        const key = `${prefix}:sets:${signature}:${today()}`;
        const hit = await cache.get<SetSummary[]>(key);
        if (hit) return hit;
        const sets = await getJson<SetSummary[]>(`/api/${prefix}/sets?v=${signature}`, "the sets");
        if (sets.every((s) => s.cardCount.total)) await cache.set(key, sets);
        return sets;
      })().finally(() => (setsLoading = undefined));
      return setsLoading;
    },

    getCardPricing: async (id) => (await getPrices(setOf(id)))[id] ?? null,

    async cachedCardPricing(ids) {
      const out = new Map<string, CardPricing | null>();
      const day = today();
      for (const setId of new Set(ids.map(setOf))) {
        const prices = await cache.get<Record<string, CardPricing>>(pricesKey(setId, day));
        if (prices) for (const id of ids) if (setOf(id) === setId) out.set(id, prices[id] ?? null);
      }
      return out;
    },

    async getPrintings(card) {
      const key = `${prefix}:printings:${card}:${signature}:${today()}`;
      const hit = await cache.get<CardWithSet[]>(key);
      if (hit) return hit;
      const printings = await getJson<CardWithSet[]>(`/api/${prefix}/printings/${encodeURIComponent(card)}?v=${signature}`, "the printings");
      await cache.set(key, printings);
      return printings;
    },
  };
}
