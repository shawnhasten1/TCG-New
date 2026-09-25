// The market, shared by the app and the Worker (worker/wallet.ts). Players sell cards to the market for coins, its
// play money, and spend them on packs. Coins aren't real money and can't be bought or passed between players.
//
// A card's value in coins is its market price (collection/prices.ts), 1 coin to the US cent. The Worker works out
// every value itself, so what the app shows is only ever a preview.

import type { Price } from "../collection/prices";
import { createRng } from "../engine/rng";
import { rarityKind, type RarityKind } from "../engine/tiers";
import type { TradeCard } from "../social/protocol";

export const COINS_PER_USD = 100;
/** Cardmarket prices are in euros. A fixed rate keeps a card's value from moving with the exchange rate. */
export const USD_PER_EUR = 1.1;
/** What the market counts a card as when there's no price for it. */
export const UNPRICED_COINS: Record<RarityKind, number> = { common: 2, uncommon: 5, rare: 25, ultra: 100, chase: 300 };

export interface CoinValue {
  coins: number;
  /** False when the value is the rarity's stand-in, for want of a price. */
  priced: boolean;
}

/** A card's value in coins, from its market price in the finish it was pulled in. Never less than 1. */
export function coinValue(price: Pick<Price, "amount" | "currency"> | undefined, rarity: string): CoinValue {
  if (!price) return { coins: UNPRICED_COINS[rarityKind(rarity)], priced: false };
  const usd = price.currency === "USD" ? price.amount : price.amount * USD_PER_EUR;
  return { coins: Math.max(1, Math.round(usd * COINS_PER_USD)), priced: true };
}

const coinFormat = new Intl.NumberFormat();
/** "1,250 coins", "1 coin". */
export const formatCoins = (n: number) => `${coinFormat.format(n)} ${n === 1 ? "coin" : "coins"}`;

export type LedgerKind = "sale" | "purchase" | "grant";

export interface LedgerEntry {
  id: string;
  kind: LedgerKind;
  /** Coins in (positive) or out (negative), and the balance straight after. */
  amount: number;
  balance: number;
  note: string;
  at: number;
}

export interface WalletResponse {
  coins: number;
  /** Newest first. */
  history: LedgerEntry[];
}

/* ---------- Selling ----------
 * Listing a card gets an offer straight away, usually a low one. A new offer replaces it every minute, and after
 * OFFERS of them the market loses interest. Each offer is worked out from the listing's seed and its number, so the
 * Worker needn't store them and reloading can't reroll one; the app is only ever told the offer that's up now.
 * A card can be listed once a day, so listing it again can't start a fresh run of offers either. */

/** Cards in one listing request, and listed at once. Each may need a price lookup, which the Worker limits. */
export const MAX_LISTED = 30;
export const OFFER_EVERY_MS = 60 * 1000;
/** Offers per listing, the first included. */
export const OFFERS = 10;
/** How long an offer can still be taken after the next replaces it, for a tap that crossed the minute. */
export const OFFER_GRACE_MS = 5 * 1000;
/** A card can be listed again this long after it last was. */
export const RELIST_AFTER_MS = 24 * 60 * 60 * 1000;
/** Offers as a share of the card's value: the first, then the rest. Middling shares are the likeliest. */
export const FIRST_OFFER: [number, number] = [0.65, 0.9];
export const LATER_OFFERS: [number, number] = [0.8, 1.03];

/** Offer number `n` (from 0) for a card worth `value` coins. */
export function offerFor(value: number, seed: string, n: number): number {
  const rng = createRng(`${seed}:${n}`);
  const [lo, hi] = n === 0 ? FIRST_OFFER : LATER_OFFERS;
  // The mean of two draws leans to the middle of the range.
  const share = lo + ((rng() + rng()) / 2) * (hi - lo);
  return Math.max(1, Math.round(value * share));
}

/** Which offer is up at `now`: OFFERS or more once they've all passed. */
export const offerNumber = (listedAt: number, now: number) => Math.max(0, Math.floor((now - listedAt) / OFFER_EVERY_MS));

/** When offer `n` is replaced (or, for the last, withdrawn). */
export const offerEnds = (listedAt: number, n: number) => listedAt + (n + 1) * OFFER_EVERY_MS;

/** Whether offer `n` can still be taken at `now`. */
export const offerOpen = (listedAt: number, n: number, now: number) =>
  Number.isInteger(n) && n >= 0 && n < OFFERS && now >= listedAt + n * OFFER_EVERY_MS && now < offerEnds(listedAt, n) + OFFER_GRACE_MS;

export interface Offer {
  n: number;
  coins: number;
  /** When it's replaced, or withdrawn if it's the last (ms). */
  until: number;
  last: boolean;
}

export interface Listing {
  id: string;
  /** The card, as a trade shows it. */
  card: TradeCard;
  /** What the market counts the card as, in coins, when it was listed. */
  value: number;
  priced: boolean;
  listedAt: number;
  offer: Offer;
}

export interface MarketResponse {
  coins: number;
  /** Listings with an offer up, oldest first. */
  listings: Listing[];
  /** Cards listed lately that can't be listed again yet, with when they can. */
  resting: { uid: string; until: number }[];
  /** The Worker's clock (ms), so countdowns can allow for a device's clock being off. */
  now: number;
}

export interface ListRequest {
  uids: string[];
}

/** The offers to take: which listing, and which offer the player saw. */
export interface SellRequest {
  offers: { id: string; n: number }[];
}

export interface SellResponse extends MarketResponse {
  sold: number;
  earned: number;
  /** Cards that couldn't be sold: gone from the collection, or the offer ran out. */
  missed: number;
}

export interface KeepRequest {
  ids: string[];
}

/** The listing ids or card uids in a request, or throws an Error saying what's wrong. */
export function parseIds(v: unknown, ok: (s: string) => boolean, what: string): string[] {
  if (!Array.isArray(v) || !v.length) throw new Error(`Pick at least one ${what}.`);
  if (v.length > MAX_LISTED) throw new Error(`That's more than ${MAX_LISTED} at once.`);
  if (!v.every((s): s is string => typeof s === "string" && ok(s))) throw new Error(`That isn't a ${what}.`);
  return [...new Set(v)];
}
