// Writes src/mtg/setRarity.json: how scarce each Magic set is, from what its commons sell for (see scripts/tiering.ts),
// so packs come from scarcer sets less often, with pity, as in Pokémon. For each set in MTG_SETS it samples up to
// SAMPLE commons (not basic lands) and takes their median non-foil price per source, from Scryfall's daily prices.
// The app ships the JSON; sets missing from it (e.g. added since the last run) count as "common".
// Usage: npm run mtg-set-rarity   (re-run after adding sets; Scryfall's answers are cached per day in .cache)
import { writeFile } from "node:fs/promises";
import { priceFor } from "../src/collection/prices";
import { fetchRawCards, toPricing, toSetData, type RawCard } from "../src/mtg/cards";
import { MTG_SETS, type MtgSet } from "../src/mtg/sets";
import { fileCache } from "./fileCache";
import { assignTiers, median, printTiers, spread, type PricedSet } from "./tiering";

const SAMPLE = 25;

const cache = fileCache();
const today = new Date().toISOString().slice(0, 10);

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A set's cards from Scryfall, waiting out a 429 (it asks for about 10–15 seconds) a few times before giving up. */
async function fetchPolitely(set: MtgSet): Promise<RawCard[]> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchRawCards(set);
    } catch (err) {
      if (attempt >= 4 || !String(err).includes("429")) throw err;
      console.log(`Scryfall asked to slow down; waiting before ${set.name}…`);
      await wait(20_000);
    }
  }
}

const rows: PricedSet[] = [];
// One set at a time, a second apart: Scryfall asks for requests to be spaced out, and answers bursts with 429s.
for (const set of MTG_SETS) {
  const key = `scryfall:${set.id}:${today}`;
  let raw = await cache.get<RawCard[]>(key);
  if (!raw) {
    raw = await fetchPolitely(set);
    await cache.set(key, raw);
    await wait(1000);
  }
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
