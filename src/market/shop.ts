// The pack shop: players spend coins on a pack from a set they choose (its pack art is still random). Shared by the
// app and the Worker, which charges these prices.
//
// A pack costs the average value of its cards marked up, so its price follows what the set is worth and buying packs to
// sell the cards loses coins on average. The average comes from scripts/packPrices.ts, which opens thousands of each
// set with the real engine and prices every card. Most packs are worth well under the average (it's the chase cards
// that make it), so a typical pack is worth much less than its price; that's the gamble, as with real boosters. Sets missing from packPrices.json (e.g. released
// since the script last ran) aren't sold: without a value, their price could be less than their packs are worth.

import prices from "./packPrices.json";

/** Bought packs' ids start with this, before and after they're opened. */
export const SHOP_PACK_PREFIX = "s-";

/** A pack costs this many times the average value of its cards. */
export const PACK_MARKUP = 1.4;
/** The least a pack costs, so a set of very cheap cards isn't nearly free. */
export const MIN_PACK_PRICE = 100;
/** Packs bought but not opened yet that a player can hold. */
export const MAX_UNOPENED = 50;

/** A pack's price from the average value of its cards (coins), marked up and rounded up to 50 coins. */
export function packPrice(value: number): number {
  const raw = Math.max(MIN_PACK_PRICE, value * PACK_MARKUP);
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

/** A bought pack waiting to be opened. */
export interface UnopenedPack {
  id: string;
  setId: string;
  /** The set's name and logo, when the Worker's set list has them. */
  setName?: string;
  logo?: string | null;
  /** Which photo of the real pack it comes in (see packs/art.ts), or null. */
  art: string | null;
  price: number;
  boughtAt: number;
}

export interface UnopenedResponse {
  /** Newest first. */
  packs: UnopenedPack[];
}

/** Whether a pack id is a bought pack's. */
export const isBoughtPack = (packId: string) => packId.startsWith(SHOP_PACK_PREFIX);
