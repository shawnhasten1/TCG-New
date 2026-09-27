// Writes src/mtg/setRarity.json: how scarce each Magic set is, from what its commons sell for (see scripts/tiering.ts),
// so packs come from scarcer sets less often, with pity, as in Pokémon. For each set in MTG_SETS it samples up to
// SAMPLE commons (not basic lands) and takes their median non-foil price per source, from Scryfall's daily prices.
// The app ships the JSON; sets missing from it (e.g. added since the last run) count as "common".
// Usage: npm run mtg-set-rarity   (re-run after adding sets; Scryfall's answers are cached per day in .cache)
import { writeFile } from "node:fs/promises";
import { priceFor } from "../src/collection/prices";
import { toPricing, toSetData } from "../src/mtg/cards";
import { MTG_SETS } from "../src/mtg/sets";
import { rawCards, today } from "./scryfall";
import { assignTiers, median, printTiers, spread, type PricedSet } from "./tiering";

const SAMPLE = 25;

const rows: PricedSet[] = [];
// One set at a time: Scryfall asks for requests to be spaced out (see scryfall.ts).
for (const set of MTG_SETS) {
  const raw = await rawCards(set);
  const data = toSetData(set, raw);
  const prices = toPricing(set, raw);
  const picks = spread(
    data.cards.filter((c) => c.rarity === "Common" && c.variants.normal),
    SAMPLE,
  );
  const usd: number[] = [];
  const eur: number[] = [];
  for (const c of picks) {
    const p = prices[c.id];
    const tcg = priceFor(p && { tcgplayer: p.tcgplayer }, "normal");
    const cm = priceFor(p && { cardmarket: p.cardmarket }, "normal");
    if (tcg) usd.push(tcg.amount);
    if (cm) eur.push(cm.amount);
  }
  const row = { set, sampled: picks.length, usd: median(usd), eur: median(eur) };
  console.log(`${set.id.padEnd(5)} ${set.name.padEnd(28)} n=${String(picks.length).padStart(2)}  $${row.usd?.toFixed(2) ?? "–"}  €${row.eur?.toFixed(2) ?? "–"}`);
  rows.push(row);
}

const out = assignTiers(rows);
await writeFile("src/mtg/setRarity.json", JSON.stringify({ generated: today, sets: out }, null, 1) + "\n");
printTiers(rows, out);
