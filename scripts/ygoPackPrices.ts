// Writes src/ygo/packPrices.json: what a Yu-Gi-Oh! pack from each set costs in the shop (src/market/shop.ts), worked out as
// scripts/packPrices.ts does for Pokémon. For each set in YGO_SETS it opens PACKS packs with the real engine, values
// every card that came out in the finish it came out in (as the market does, src/market/protocol.ts), from YGOPRODeck's
// prices (estimated where a printing has none of its own, src/ygo/cards.ts), and averages that per pack. The price is that marked up (packPrice in src/market/shop.ts).
// Usage: npm run ygo-pack-prices   (re-run after adding sets; YGOPRODeck's answers are cached per day in .cache)
import { writeFile } from "node:fs/promises";
import { priceFor } from "../src/collection/prices";
import { openPack, whyNotOpenable } from "../src/engine/openPack";
import { createRng } from "../src/engine/rng";
import { TIERS } from "../src/engine/setRarity";
import { coinValue } from "../src/market/protocol";
import { packPrice, type ShopEntry } from "../src/market/shop";
import { toPricing, toSetData } from "../src/ygo/cards";
import { YGO_SETS, ygoProfile, ygoSetTier } from "../src/ygo/sets";
import { rawCards, today } from "./ygoprodeck";

const PACKS = 3000;
const OUT = "src/ygo/packPrices.json";

const priced: Record<string, ShopEntry> = {};
// One set at a time: YGOPRODeck blocks an IP past 20 requests a second (see ygoprodeck.ts).
for (const set of YGO_SETS) {
  const raw = await rawCards(set);
  const data = toSetData(set, raw);
  const pricing = toPricing(set, raw);
  const profile = ygoProfile(set);
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
  console.log(`${set.id.padEnd(5)} ${set.name.slice(0, 28).padEnd(28)} ${ygoSetTier(set.id).padEnd(9)} value ${String(value).padStart(6)}  price ${String(price).padStart(6)}`);
}

const sorted = Object.fromEntries(Object.entries(priced).sort((a, b) => a[0].localeCompare(b[0])));
await writeFile(OUT, JSON.stringify({ generated: today, packs: PACKS, sets: sorted }, null, 1) + "\n");
console.log(`\nWrote ${Object.keys(sorted).length} sets.`);
for (const t of TIERS) {
  const prices = Object.entries(sorted)
    .filter(([id]) => ygoSetTier(id) === t.id)
    .map(([, e]) => e.price)
    .sort((a, b) => a - b);
  if (prices.length) console.log(`${t.name}: ${prices.length} sets, ${prices[0]}–${prices[prices.length - 1]} Star Chips (median ${prices[prices.length >> 1]})`);
}
