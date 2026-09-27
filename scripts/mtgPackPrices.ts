// Writes src/mtg/packPrices.json: what a Magic pack from each set costs in the shop (src/market/shop.ts), worked out as
// scripts/packPrices.ts does for Pokémon. For each set in MTG_SETS it opens PACKS packs with the real engine, values
// every card that came out in the finish it came out in (as the market does, src/market/protocol.ts), from Scryfall's
// daily prices, and averages that per pack. The price is that marked up (packPrice in src/market/shop.ts).
// Usage: npm run mtg-pack-prices   (re-run after adding sets; Scryfall's answers are cached per day in .cache)
import { writeFile } from "node:fs/promises";
import { priceFor } from "../src/collection/prices";
import { openPack, whyNotOpenable } from "../src/engine/openPack";
import { createRng } from "../src/engine/rng";
import { TIERS } from "../src/engine/setRarity";
import { coinValue } from "../src/market/protocol";
import { packPrice, type ShopEntry } from "../src/market/shop";
import { toPricing, toSetData } from "../src/mtg/cards";
import { MTG_SETS, mtgProfile, mtgSetTier } from "../src/mtg/sets";
import { rawCards, today } from "./scryfall";

const PACKS = 3000;
const OUT = "src/mtg/packPrices.json";

const priced: Record<string, ShopEntry> = {};
// One set at a time: Scryfall asks for requests to be spaced out (see scryfall.ts).
for (const set of MTG_SETS) {
  const raw = await rawCards(set);
  const data = toSetData(set, raw);
  const pricing = toPricing(set, raw);
  const profile = mtgProfile(set);
  const why = whyNotOpenable(data, profile);
  if (why) {
    console.log(`${set.id.padEnd(5)} skipped: ${why}`);
    continue;
  }
  const rng = createRng(`pack-prices:${set.id}`);
  let total = 0;
  for (let i = 0; i < PACKS; i++) {
    for (const p of openPack(data, profile, rng)) total += coinValue(priceFor(pricing[p.card.id], p.finish, p.firstEdition), p.card.rarity).coins;
  }
  const value = Math.round(total / PACKS);
  const price = packPrice(value);
  priced[set.id] = { value, price };
  console.log(`${set.id.padEnd(5)} ${set.name.slice(0, 28).padEnd(28)} ${mtgSetTier(set.id).padEnd(9)} value ${String(value).padStart(6)}  price ${String(price).padStart(6)}`);
}

const sorted = Object.fromEntries(Object.entries(priced).sort((a, b) => a[0].localeCompare(b[0])));
await writeFile(OUT, JSON.stringify({ generated: today, packs: PACKS, sets: sorted }, null, 1) + "\n");
console.log(`\nWrote ${Object.keys(sorted).length} sets.`);
for (const t of TIERS) {
  const prices = Object.entries(sorted)
    .filter(([id]) => mtgSetTier(id) === t.id)
    .map(([, e]) => e.price)
    .sort((a, b) => a - b);
  if (prices.length) console.log(`${t.name}: ${prices.length} sets, ${prices[0]}–${prices[prices.length - 1]} Treasure (median ${prices[prices.length >> 1]})`);
}
