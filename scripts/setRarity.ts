// Writes src/engine/setRarity.json: how scarce each openable Pokémon set is, from what its commons sell for (see
// scripts/tiering.ts). For each set it samples up to SAMPLE non-energy commons (uncommons if a set has too few) and takes
// their median unlimited-print price per source.
// The app ships the JSON; sets missing from it (e.g. released since the last run) count as "common".
// Usage: npm run set-rarity   (re-run occasionally; prices are cached per day in .cache)
import { writeFile } from "node:fs/promises";
import type { Card } from "../src/api/types";
import { createClient } from "../src/api/tcgdex";
import { priceFor } from "../src/collection/prices";
import { hiddenReason } from "../src/engine/openable";
import { fileCache } from "./fileCache";
import { assignTiers, mapLimit, median, printTiers, spread, type PricedSet } from "./tiering";

const SAMPLE = 15;

const client = createClient(fileCache());

function sample(cards: Card[]): Card[] {
  const pool = (r: string) => cards.filter((c) => c.rarity === r && c.category !== "Energy");
  let picks = pool("Common");
  if (picks.length < 5) picks = [...picks, ...pool("Uncommon")];
  return spread(picks, SAMPLE);
}

const sets = (await client.listSetSummaries()).filter((s) => !hiddenReason(s));
console.log(`Sampling ${sets.length} sets…`);

const rows = await mapLimit(sets, 3, async (set): Promise<PricedSet> => {
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
    return { set, sampled: 0 };
  }
});

const out = assignTiers(rows);
await writeFile("src/engine/setRarity.json", JSON.stringify({ generated: new Date().toISOString().slice(0, 10), sets: out }, null, 1) + "\n");
printTiers(rows, out);
