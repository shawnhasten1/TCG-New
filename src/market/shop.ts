// The pack shop: players spend coins on a pack from a set they choose (its pack art is still random). Shared by the
// app and the Worker, which charges these prices.
//
// A pack costs well over what its cards would sell for, so buying packs to sell their cards loses coins on average:
// the shop is for chasing a set, not for making coins. Each set's price comes from the average value of a pack of it
// (scripts/packPrices.ts, which opens thousands with the real engine and prices every card), marked up, with a
// minimum per set tier so even a set of cheap cards costs something. Sets missing from packPrices.json (e.g. released
// since the script last ran) aren't sold: without a value, their price could be less than their packs are worth.

import type { SetTier } from "../engine/setRarity";
import prices from "./packPrices.json";

/** Bought packs' ids start with this, before and after they're opened. */
export const SHOP_PACK_PREFIX = "s-";

/** A pack costs this many times the average value of its cards. */
export const PACK_MARKUP = 1.4;
/** The least a pack costs, by how scarce its set is. */
export const TIER_FLOOR: Record<SetTier, number> = { common: 300, uncommon: 600, rare: 1200, legendary: 3000 };
/** Packs bought but not opened yet that a player can hold. */
export const MAX_UNOPENED = 50;

/** A pack's price from the average value of its cards (coins), rounded to 10 coins, or 50 from 1,000. */
export function packPrice(value: number, tier: SetTier): number {
  const raw = Math.max(TIER_FLOOR[tier], value * PACK_MARKUP);
  const step = raw >= 1000 ? 50 : 10;
  return Math.ceil(raw / step) * step;
}

export interface ShopEntry {
  /** Average value of a pack's cards, in coins. */
  value: number;
  price: number;
}

const table = (prices as { sets: Record<string, ShopEntry> }).sets;

/** What a pack from a set costs, or undefined if the shop doesn't sell it. */
export const shopPrice = (setId: string): number | undefined => (Object.hasOwn(table, setId) ? table[setId].price : undefined);

/** Every set the shop sells, by id. */
export const shopSets = (): Record<string, ShopEntry> => table;

/** Buying a pack. */
export interface BuyRequest {
  setId: string;
}

export interface BuyResponse {
  coins: number;
  /** The pack, unopened; its id starts "s-". */
  pack: { id: string; setId: string; art: string | null };
  /** Bought packs waiting to be opened, this one included. */
  unopened: number;
}
