// Market prices across the collection views: the shared toggle, fetching, and totals.

import { useEffect, useMemo, useState } from "react";
import type { CardPricing } from "../api/tcgdex";
import { client } from "../app/client";
import { updateSettings, useSettings } from "../app/settings";
import type { Ownership } from "./progress";
import { formatPrice, priceFor, type Price } from "./prices";
import type { PullRecord } from "./store";

export type Totals = Record<Price["currency"], number>;

/** How often fetched prices are handed to the page. Each hand-off re-sorts and re-renders it, so not once per card. */
const FLUSH_MS = 400;

/** Today's prices seen this session, so moving between collection pages doesn't load them again. */
let known = { day: "", prices: new Map<string, CardPricing | null>() };
function knownPrices() {
  const day = new Date().toISOString().slice(0, 10);
  if (known.day !== day) known = { day, prices: new Map() };
  return known.prices;
}

/**
 * Loads prices for `ids`: everything already cached in one go, then the rest from TCGdex a few at a time (it
 * rate-limits bursts), handing them over in batches.
 */
async function loadPrices(ids: string[], onPrices: (got: Map<string, CardPricing | null>) => void, signal: { live: boolean }) {
  const seen = knownPrices();
  const first = new Map<string, CardPricing | null>(ids.filter((id) => seen.has(id)).map((id) => [id, seen.get(id)!]));
  const cached = await client.cachedCardPricing(ids.filter((id) => !seen.has(id)));
  if (!signal.live) return;
  for (const [id, p] of cached) {
    seen.set(id, p);
    first.set(id, p);
  }
  onPrices(first);

  const todo = ids.filter((id) => !seen.has(id));
  let batch = new Map<string, CardPricing | null>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    timer = undefined;
    if (!signal.live || !batch.size) return;
    onPrices(batch);
    batch = new Map();
  };
  let next = 0;
  const worker = async () => {
    while (next < todo.length && signal.live) {
      const id = todo[next++];
      const p = await client.getCardPricing(id).catch(() => null);
      seen.set(id, p);
      batch.set(id, p);
      timer ??= setTimeout(flush, FLUSH_MS);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  clearTimeout(timer);
  flush();
}

/** Pricing for `ids` while prices are switched on (or `always`); `loading` until every one has answered. */
export function useCardPrices(ids: string[], always = false) {
  const showPrices = useSettings().showPrices || always;
  const key = useMemo(() => [...new Set(ids)].sort().join(","), [ids]);
  const [prices, setPrices] = useState<Map<string, CardPricing | null>>(() => {
    const seen = knownPrices();
    return new Map(ids.filter((id) => seen.has(id)).map((id) => [id, seen.get(id)!]));
  });

  useEffect(() => {
    if (!showPrices || !key) return;
    const signal = { live: true };
    const todo = key.split(",").filter((id) => !prices.has(id));
    if (!todo.length) return;
    void loadPrices(todo, (got) => signal.live && got.size && setPrices((m) => new Map([...m, ...got])), signal);
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
