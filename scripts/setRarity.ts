// Writes src/engine/setRarity.json: how scarce each openable set is, from market prices.
// Print runs aren't public, so scarcity is inferred from what a set's commons sell for: nobody chases
// commons for their art, so their price mostly reflects how much supply is left.
// For each set it samples up to SAMPLE non-energy commons (uncommons if a set has too few), takes the
// median unlimited-print price per source (TCGplayer USD, Cardmarket EUR), ranks sets per source,
// averages the ranks into a 0–1 score, and cuts the ranking into tiers.
// The app ships the JSON; sets missing from it (e.g. released since the last run) count as "common".
// Usage: npm run set-rarity   (re-run occasionally; prices are cached per day in .cache)
import { writeFile } from "node:fs/promises";
import type { Card } from "../src/api/types";
import { createClient } from "../src/api/tcgdex";
import { priceFor } from "../src/collection/prices";
import { hiddenReason } from "../src/engine/openable";
import { TIERS, type SetTier } from "../src/engine/setRarity";
import { fileCache } from "./fileCache";

const SAMPLE = 15;
/** Share of ranked sets in each tier, rarest first. The rest are "common". */
const TIER_SHARE: [SetTier, number][] = [
  ["legendary", 0.05],
  ["rare", 0.15],
  ["uncommon", 0.3],
];

const client = createClient(fileCache());

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
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

const median = (xs: number[]) => {
  const s = xs.filter((x) => x > 0).sort((a, b) => a - b);
  if (!s.length) return undefined;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Evenly spaced picks through the set, so one popular Pokémon doesn't dominate the sample. */
function sample(cards: Card[]): Card[] {
  const pool = (r: string) => cards.filter((c) => c.rarity === r && c.category !== "Energy");
  let picks = pool("Common");
  if (picks.length < 5) picks = [...picks, ...pool("Uncommon")];
  if (picks.length <= SAMPLE) return picks;
  return Array.from({ length: SAMPLE }, (_, i) => picks[Math.floor((i * picks.length) / SAMPLE)]);
}

/** 0 (cheapest) to 1 (dearest) by position among the sets that have a value. */
function percentiles(values: (number | undefined)[]): (number | undefined)[] {
  const ranked = values.map((v, i) => [v, i] as const).filter(([v]) => v !== undefined).sort((a, b) => a[0]! - b[0]!);
  const out: (number | undefined)[] = new Array(values.length);
  ranked.forEach(([, i], r) => (out[i] = ranked.length > 1 ? r / (ranked.length - 1) : 0.5));
  return out;
}

const sets = (await client.listSetSummaries()).filter((s) => !hiddenReason(s));
console.log(`Sampling ${sets.length} sets…`);

const rows = await mapLimit(sets, 3, async (set) => {
  try {
    const picks = sample((await client.getSetCards(set.id)).cards);
    const pricings = await mapLimit(picks, 6, (c) => client.getCardPricing(c.id).catch(() => null));
    const usd: number[] = [];
    const eur: number[] = [];
    for (const p of pricings) {
      const tcg = priceFor(p && { tcgplayer: p.tcgplayer }, "normal");
      const cm = priceFor(p && { cardmarket: p.cardmarket }, "normal");
      if (tcg) usd.push(tcg.amount);
      if (cm) eur.push(cm.amount);
    }
    const row = { set, sampled: picks.length, usd: median(usd), eur: median(eur) };
    console.log(`${set.id.padEnd(10)} ${set.name.padEnd(28)} n=${String(picks.length).padStart(2)}  $${row.usd?.toFixed(2) ?? "–"}  €${row.eur?.toFixed(2) ?? "–"}`);
    return row;
  } catch (err) {
    console.warn(`Skipping ${set.id}: ${String(err)}`);
    return { set, sampled: 0, usd: undefined, eur: undefined };
  }
});

const usdRank = percentiles(rows.map((r) => r.usd));
const eurRank = percentiles(rows.map((r) => r.eur));
const scored = rows
  .map((r, i) => {
    const ranks = [usdRank[i], eurRank[i]].filter((x): x is number => x !== undefined);
    return { ...r, score: ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : undefined };
  })
  .filter((r) => r.score !== undefined)
  .sort((a, b) => b.score! - a.score!);

const out: Record<string, { tier: SetTier; score: number; usd: number | null; eur: number | null; sampled: number }> = {};
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

await writeFile(
  "src/engine/setRarity.json",
  JSON.stringify({ generated: new Date().toISOString().slice(0, 10), sets: out }, null, 1) + "\n",
);
console.log(`\nWrote ${scored.length} sets (${rows.length - scored.length} without prices count as common).`);
for (const t of TIERS) {
  const ids = scored.filter((r) => out[r.set.id].tier === t.id);
  console.log(`${t.name} (${ids.length}): ${ids.map((r) => r.set.name).join(", ")}`);
}
