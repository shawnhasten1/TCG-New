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
/** Coins every member starts with, given once. */
export const WELCOME_COINS = 5000;
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
 * Listing a card gets an offer straight away, usually a low one, and another comes in every minute, up to OFFERS.
 * Every offer stays on the table until the player sells to one or keeps the card; they have DECIDE_MS after the last
 * offer comes in. Nothing is sold or kept for them: if they leave it, the listing lapses and the card simply stays
 * in their collection. A kept or lapsed card can be listed again straight away, for a fresh run of offers.
 * Each offer (and the trainer making it) is worked out from the listing's seed and its number, so the Worker needn't
 * store them and reloading can't reroll one; the app is only told offers that have come in. */

/** Cards listed in one go. Each may need a price lookup, which the Worker limits. */
export const MAX_LIST_AT_ONCE = 30;
/** Cards on the market at once. */
export const MAX_LISTED = 100;
export const OFFER_EVERY_MS = 60 * 1000;
/** Offers per listing, the first included. */
export const OFFERS = 10;
/** How long the player has to sell or keep after the last offer comes in. */
export const DECIDE_MS = 12 * 60 * 60 * 1000;
/** How long offers can still be taken after the listing closes, for a tap that crossed the line. */
export const OFFER_GRACE_MS = 5 * 1000;
/** Offers as a share of the card's value: the first, then the rest. Middling shares are the likeliest. */
export const FIRST_OFFER: [number, number] = [0.65, 0.9];
export const LATER_OFFERS: [number, number] = [0.8, 1.03];

/**
 * Who makes offers, by how good an offer is: the least a share of the value must be for each group. Youngsters
 * lowball; collectors pay up.
 */
export const TRAINERS: { from: number; classes: string[] }[] = [
  { from: 0.98, classes: ["Collector", "Gentleman", "Rich Boy", "Lady", "Socialite", "Veteran"] },
  { from: 0.9, classes: ["Ace Trainer", "Pokémon Breeder", "Scientist", "Super Nerd", "Black Belt", "Psychic", "Pokémon Ranger", "Pokéfan"] },
  { from: 0.78, classes: ["Hiker", "Fisherman", "Swimmer", "Bird Keeper", "Sailor", "Backpacker", "Kindler", "Juggler"] },
  { from: 0, classes: ["Youngster", "Bug Catcher", "Lass", "Tuber", "Camper", "Picnicker"] },
];
export const TRAINER_NAMES = [
  "Tom", "Sam", "Joey", "Ana", "Mia", "Leo", "Kai", "Ben", "Zoe", "Max", "Ivy", "Eli", "Ray", "Jin", "Nia",
  "Otto", "Rosa", "Dale", "Gus", "Tess", "Wes", "Hana", "Omar", "Lou", "Pip", "Remy", "Vera", "Cal", "Dot", "Finn",
];

export interface MarketOffer {
  n: number;
  coins: number;
  /** The trainer making it, e.g. "Hiker Tom". */
  from: string;
}

/** Offer number `n` (from 0) for a card worth `value` coins. */
export function offerFor(value: number, seed: string, n: number): MarketOffer {
  const rng = createRng(`${seed}:${n}`);
  const [lo, hi] = n === 0 ? FIRST_OFFER : LATER_OFFERS;
  // The mean of two draws leans to the middle of the range.
  const share = lo + ((rng() + rng()) / 2) * (hi - lo);
  const classes = TRAINERS.find((t) => share >= t.from)!.classes;
  const from = `${classes[Math.floor(rng() * classes.length)]} ${TRAINER_NAMES[Math.floor(rng() * TRAINER_NAMES.length)]}`;
  return { n, coins: Math.max(1, Math.round(value * share)), from };
}

/** Offers in so far at `now`: at least the first, and OFFERS once they all are. */
export const offersIn = (listedAt: number, now: number) => Math.min(OFFERS, Math.max(1, Math.floor((now - listedAt) / OFFER_EVERY_MS) + 1));

/** When offer `n` comes in. */
export const offerAt = (listedAt: number, n: number) => listedAt + n * OFFER_EVERY_MS;

/** When the listing lapses and its offers are withdrawn, if the player hasn't sold or kept the card. */
export const listingCloses = (listedAt: number) => offerAt(listedAt, OFFERS - 1) + DECIDE_MS;

/** Whether offer `n` can be taken at `now`: it's come in and the listing hasn't closed. */
export const offerOpen = (listedAt: number, n: number, now: number) =>
  Number.isInteger(n) && n >= 0 && n < OFFERS && now >= offerAt(listedAt, n) && now < listingCloses(listedAt) + OFFER_GRACE_MS;

/** The best of some offers; the earliest, if two are as good. */
export const bestOffer = <T extends Pick<MarketOffer, "coins">>(offers: T[]): T | undefined => offers.reduce<T | undefined>((best, o) => (!best || o.coins > best.coins ? o : best), undefined);

export interface Listing {
  id: string;
  /** The card, as a trade shows it. */
  card: TradeCard;
  /** What the market counts the card as, in coins, when it was listed. */
  value: number;
  priced: boolean;
  listedAt: number;
  /** Offers in so far, oldest first; any can be taken. */
  offers: MarketOffer[];
  /** When the next offer comes in, or null after the last. */
  nextAt: number | null;
  closesAt: number;
}

export interface MarketResponse {
  coins: number;
  /** Open listings, oldest first. */
  listings: Listing[];
  /** The Worker's clock (ms), so countdowns can allow for a device's clock being off. */
  now: number;
}

export interface ListRequest {
  uids: string[];
}

/** The offers to take: which listing, and which of its offers. */
export interface SellRequest {
  offers: { id: string; n: number }[];
}

export interface SellResponse extends MarketResponse {
  sold: number;
  /** The listings sold, which can then be shared to the feed. */
  soldIds: string[];
  earned: number;
  /** Cards that couldn't be sold: gone from the collection, or the listing lapsed. */
  missed: number;
}

export interface KeepRequest {
  ids: string[];
}

/** Sharing a sale to the friends feed. Only ever done when the player asks. */
export interface ShareSaleRequest {
  id: string;
}

/** The listing ids or card uids in a request, or throws an Error saying what's wrong. */
export function parseIds(v: unknown, ok: (s: string) => boolean, what: string, max: number): string[] {
  if (!Array.isArray(v) || !v.length) throw new Error(`Pick at least one ${what}.`);
  if (v.length > max) throw new Error(`That's more than ${max} at once.`);
  if (!v.every((s): s is string => typeof s === "string" && ok(s))) throw new Error(`That isn't a ${what}.`);
  return [...new Set(v)];
}
