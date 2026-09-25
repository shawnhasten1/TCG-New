// The market, shared by the app and the Worker (worker/wallet.ts). Players sell cards to the market for coins, its
// play money, and spend them on packs. Coins aren't real money and can't be bought or passed between players.
//
// A card's value in coins is its market price (collection/prices.ts), 1 coin to the US cent. The Worker works out
// every value itself, so what the app shows is only ever a preview.

import { rarityKind, type RarityKind } from "../engine/tiers";
import type { Price } from "../collection/prices";

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
