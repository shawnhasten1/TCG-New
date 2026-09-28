// Ranking sets into rarity tiers by what their commons sell for, shared by each game's set-rarity script
// (setRarity.ts for Pokémon, mtgSetRarity.ts for Magic, ygoSetRarity.ts for Yu-Gi-Oh!). Print runs aren't public, so scarcity is inferred from
// commons' prices: nobody chases commons for their art, so their price mostly reflects how much supply is left.
// Each set's median price per source (TCGplayer USD, Cardmarket EUR) is ranked among the sets, the ranks averaged
// into a 0–1 score, and the ranking cut into tiers.
import { TIERS, type SetTier } from "../src/engine/setRarity";

/** Share of ranked sets in each tier, rarest first. The rest are "common". */
const TIER_SHARE: [SetTier, number][] = [
  ["legendary", 0.05],
  ["rare", 0.15],
  ["uncommon", 0.3],
];

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export const median = (xs: number[]) => {
  const s = xs.filter((x) => x > 0).sort((a, b) => a - b);
  if (!s.length) return undefined;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Evenly spaced picks through `cards`, so one popular card doesn't dominate the sample. */
export function spread<T>(cards: T[], n: number): T[] {
  if (cards.length <= n) return cards;
  return Array.from({ length: n }, (_, i) => cards[Math.floor((i * cards.length) / n)]);
}

/** 0 (cheapest) to 1 (dearest) by position among the sets that have a value. */
function percentiles(values: (number | undefined)[]): (number | undefined)[] {
  const ranked = values.map((v, i) => [v, i] as const).filter(([v]) => v !== undefined).sort((a, b) => a[0]! - b[0]!);
  const out: (number | undefined)[] = new Array(values.length);
  ranked.forEach(([, i], r) => (out[i] = ranked.length > 1 ? r / (ranked.length - 1) : 0.5));
  return out;
}

export interface PricedSet {
  set: { id: string; name: string };
  sampled: number;
  /** Median price of the sampled commons. */
  usd?: number;
  eur?: number;
}

export type TierEntry = { tier: SetTier; score: number; usd: number | null; eur: number | null; sampled: number };

/** Each priced set's tier and score, by set id. Sets with no prices are left out (they count as "common"). */
export function assignTiers(rows: PricedSet[]): Record<string, TierEntry> {
  const usdRank = percentiles(rows.map((r) => r.usd));
  const eurRank = percentiles(rows.map((r) => r.eur));
  const scored = rows
    .map((r, i) => {
      const ranks = [usdRank[i], eurRank[i]].filter((x): x is number => x !== undefined);
      return { ...r, score: ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : undefined };
    })
    .filter((r) => r.score !== undefined)
    .sort((a, b) => b.score! - a.score!);

  const out: Record<string, TierEntry> = {};
  let start = 0;
  const cuts = TIER_SHARE.map(([tier, share]) => {
    const end = start + Math.round(share * scored.length);
    const cut = { tier, start, end };
    start = end;
    return cut;
  });
  scored.forEach((r, i) => {
    const tier = cuts.find((c) => i >= c.start && i < c.end)?.tier ?? "common";
    const round = (x?: number) => (x === undefined ? null : Math.round(x * 100) / 100);
    out[r.set.id] = { tier, score: Math.round(r.score! * 1000) / 1000, usd: round(r.usd), eur: round(r.eur), sampled: r.sampled };
  });
  return out;
}

/** Prints each tier's sets, rarest last. */
export function printTiers(rows: PricedSet[], out: Record<string, TierEntry>) {
  const priced = rows.filter((r) => out[r.set.id]);
  console.log(`\nWrote ${priced.length} sets (${rows.length - priced.length} without prices count as common).`);
  for (const t of TIERS) {
    const sets = priced.filter((r) => out[r.set.id].tier === t.id).sort((a, b) => out[b.set.id].score - out[a.set.id].score);
    console.log(`${t.name} (${sets.length}): ${sets.map((r) => r.set.name).join(", ")}`);
  }
}
