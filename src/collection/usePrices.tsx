// Market prices across the collection views: the shared toggle, fetching, and totals.

import { useEffect, useMemo, useState } from "react";
import type { CardPricing } from "../api/tcgdex";
import { client } from "../app/client";
import { updateSettings, useSettings } from "../app/settings";
import type { Ownership } from "./progress";
import { formatPrice, priceFor, type Price } from "./prices";
import type { PullRecord } from "./store";

export type Totals = Record<Price["currency"], number>;

/** Fetches prices a few at a time; TCGdex rate-limits bursts. */
async function loadPrices(ids: string[], onPrice: (id: string, p: CardPricing | null) => void, signal: { live: boolean }) {
  let next = 0;
  const worker = async () => {
    while (next < ids.length && signal.live) {
      const id = ids[next++];
      onPrice(id, await client.getCardPricing(id).catch(() => null));
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}

/** Pricing for `ids` while prices are switched on (or `always`); `loading` until every one has answered. */
export function useCardPrices(ids: string[], always = false) {
  const showPrices = useSettings().showPrices || always;
  const [prices, setPrices] = useState<Map<string, CardPricing | null>>(new Map());
  const key = useMemo(() => [...new Set(ids)].sort().join(","), [ids]);

  useEffect(() => {
    if (!showPrices || !key) return;
    const signal = { live: true };
    const todo = key.split(",").filter((id) => !prices.has(id));
    void loadPrices(todo, (id, p) => signal.live && setPrices((m) => new Map(m).set(id, p)), signal);
    return () => void (signal.live = false);
    // `prices` is left out of the deps on purpose: it only skips what's already fetched.
  }, [showPrices, key]);

  const loading = showPrices && ids.some((id) => !prices.has(id));
  return { showPrices, prices, loading };
}

/** Summed value of these pulls, each at its own finish. */
export function pullsValue(pulls: PullRecord[], prices: Map<string, CardPricing | null>): Totals {
  const totals = { USD: 0, EUR: 0 };
  for (const p of pulls) {
    const price = priceFor(prices.get(p.cardId), p.finish, p.firstEdition);
    if (price) totals[price.currency] += price.amount;
  }
  return totals;
}

/** Price of a card's single best-finish copy, for a tile caption. */
export function ownedPrice(pricing: CardPricing | null | undefined, o: Ownership): Price | undefined {
  return priceFor(pricing, o.byFinish.holo ? "holo" : o.byFinish.reverse ? "reverse" : "normal", o.firstEdition > 0);
}

export function formatTotals(t: Totals): string {
  return (
    [t.USD && formatPrice({ amount: t.USD, currency: "USD" }), t.EUR && formatPrice({ amount: t.EUR, currency: "EUR" })].filter(Boolean).join(" + ") || "—"
  );
}

export function PriceToggle() {
  const { showPrices } = useSettings();
  return (
    <label>
      <input type="checkbox" checked={showPrices} onChange={(e) => updateSettings({ showPrices: e.target.checked })} /> Show market prices
    </label>
  );
}
