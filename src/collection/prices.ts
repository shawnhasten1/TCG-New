// Market price for a card in a given finish, from TCGdex pricing (TCGplayer first, then Cardmarket).

import type { CardPricing } from "../api/tcgdex";
import type { Finish } from "../engine/types";

export interface Price {
  amount: number;
  currency: "USD" | "EUR";
  source: "TCGplayer" | "Cardmarket";
}

type Entry = { marketPrice?: number | null; midPrice?: number | null };

/** TCGplayer printings, normalized ("reverse-holofoil" → "reverseholofoil"). */
const TCG_KEYS: Record<Finish, { first: string[]; unlimited: string[] }> = {
  normal: { first: ["1steditionnormal", "1stedition"], unlimited: ["normal", "unlimitednormal", "unlimited"] },
  holo: { first: ["1steditionholofoil"], unlimited: ["holofoil", "unlimitedholofoil"] },
  reverse: { first: [], unlimited: ["reverseholofoil"] },
};

const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");
const num = (v: unknown) => (typeof v === "number" && v > 0 ? v : undefined);

export function priceFor(pricing: CardPricing | null | undefined, finish: Finish, firstEdition = false): Price | undefined {
  if (!pricing) return undefined;
  const tcg = pricing.tcgplayer;
  if (tcg) {
    const entries = new Map(Object.entries(tcg).filter(([, v]) => v && typeof v === "object").map(([k, v]) => [norm(k), v as Entry]));
    const keys = firstEdition ? [...TCG_KEYS[finish].first, ...TCG_KEYS[finish].unlimited] : TCG_KEYS[finish].unlimited;
    for (const k of keys) {
      const e = entries.get(k);
      const amount = num(e?.marketPrice) ?? num(e?.midPrice);
      if (amount) return { amount, currency: "USD", source: "TCGplayer" };
    }
  }
  const cm = pricing.cardmarket;
  if (cm) {
    // Cardmarket's "-holo" columns are the foil version of a non-holo card, i.e. the reverse holo.
    const amount = finish === "reverse" ? num(cm["avg-holo"]) ?? num(cm["trend-holo"]) : num(cm.trend) ?? num(cm.avg);
    if (amount) return { amount, currency: "EUR", source: "Cardmarket" };
  }
  return undefined;
}

const formatters = new Map<string, Intl.NumberFormat>();
export function formatPrice(p: Pick<Price, "amount" | "currency">): string {
  let f = formatters.get(p.currency);
  if (!f) formatters.set(p.currency, (f = new Intl.NumberFormat(undefined, { style: "currency", currency: p.currency })));
  return f.format(p.amount);
}
