// The pack shop: players spend coins on a pack from a set they choose (its pack art is still random). Shared by the
// app and the Worker, which charges these prices.
//
// Packs cost a set price per set tier, so buying one is a treat rather than routine. A few sets' cards are worth nearly
// that much or more, and buying their packs to sell the cards would make coins, so a pack never costs less than the
// average value of its cards marked up (from scripts/packPrices.ts, which opens thousands of each set with the real
// engine and prices every card). Sets missing from packPrices.json (e.g. released
// since the script last ran) aren't sold: without a value, their price could be less than their packs are worth.

import type { SetTier } from "../engine/setRarity";
import prices from "./packPrices.json";

/** Bought packs' ids start with this, before and after they're opened. */
export const SHOP_PACK_PREFIX = "s-";

/** A pack's price by how scarce its set is. */
export const TIER_FLOOR: Record<SetTier, number> = { common: 2500, uncommon: 7500, rare: 20000, legendary: 50000 };
/** A pack never costs less than this many times the average value of its cards. */
export const PACK_MARKUP = 1.4;
/** Packs bought but not opened yet that a player can hold. */
export const MAX_UNOPENED = 50;

/** A pack's price: its tier's, or its cards' average value (coins) marked up if that's more, rounded up to 50 coins. */
export function packPrice(value: number, tier: SetTier): number {
  const raw = Math.max(TIER_FLOOR[tier], value * PACK_MARKUP);
  return Math.ceil(raw / 50) * 50;
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
