// Writes src/market/packPrices.json: what a pack from each set costs in the shop (src/market/shop.ts).
// For each openable set it opens PACKS packs with the real engine, prices every card that came out in the finish it
// came out in (as the market values cards to buy them, src/market/protocol.ts), and averages that per pack. The price
// is that marked up (packPrice in src/market/shop.ts).
// Usage: npm run pack-prices   (re-run now and then; prices are cached per day in .cache)
//        npm run pack-prices -- --reprice   (just re-apply shop.ts's pricing to the values already worked out)
import { readFile, writeFile } from "node:fs/promises";
import type { CardPricing } from "../src/api/tcgdex";
import { createClient } from "../src/api/tcgdex";
import { priceFor } from "../src/collection/prices";
import { hiddenReason } from "../src/engine/openable";
import { openPack, whyNotOpenable } from "../src/engine/openPack";
import { profileFor } from "../src/engine/profiles";
import { createRng } from "../src/engine/rng";
import { setTier, TIERS } from "../src/engine/setRarity";
import { coinValue } from "../src/market/protocol";
import { packPrice, type ShopEntry } from "../src/market/shop";
import { fileCache } from "./fileCache";

const PACKS = 3000;
/** A set is skipped if more than this share of its cards couldn't be priced (the lookups failed, not "no price"). */
const MAX_FAILED = 0.05;

const client = createClient(fileCache());
const OUT = "src/market/packPrices.json";

if (process.argv.includes("--reprice")) {
  const file = JSON.parse(await readFile(OUT, "utf8")) as { sets: Record<string, ShopEntry> };
  for (const e of Object.values(file.sets)) e.price = packPrice(e.value);
  await writeFile(OUT, JSON.stringify(file, null, 1) + "\n");
  summarize(file.sets);
  process.exit(0);
}

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

const sets = (await client.listSetSummaries()).filter((s) => !hiddenReason(s));
console.log(`Pricing packs from ${sets.length} sets (${PACKS} packs each)…`);

const rows = await mapLimit(sets, 2, async (set): Promise<[string, ShopEntry] | undefined> => {
  try {
    const data = await client.getSetCards(set.id);
    const profile = profileFor(data.set);
    const why = profile ? whyNotOpenable(data, profile) : "no pack profile";
    if (!profile || why) {
      console.log(`${set.id.padEnd(10)} skipped: ${why}`);
      return undefined;
    }
    // How many of each card, finish and edition came out.
    const rng = createRng(`pack-prices:${set.id}`);
    const pulls = new Map<string, { rarity: string; cardId: string; finish: "normal" | "holo" | "reverse"; firstEdition: boolean; n: number }>();
    for (let i = 0; i < PACKS; i++) {
      for (const p of openPack(data, profile, rng)) {
        const key = `${p.card.id}|${p.finish}|${p.firstEdition ? 1 : 0}`;
        const hit = pulls.get(key);
        if (hit) hit.n++;
        else pulls.set(key, { rarity: p.card.rarity, cardId: p.card.id, finish: p.finish, firstEdition: p.firstEdition, n: 1 });
      }
    }
    const ids = [...new Set([...pulls.values()].map((p) => p.cardId))];
    let failed = 0;
    const pricing = new Map<string, CardPricing | null>(
      await mapLimit(ids, 6, async (id) => {
        try {
          return [id, await client.getCardPricing(id)] as const;
        } catch {
          failed++;
          return [id, null] as const;
        }
      }),
    );
    if (failed / ids.length > MAX_FAILED) {
      console.warn(`${set.id.padEnd(10)} skipped: ${failed} of ${ids.length} price lookups failed (run again to retry)`);
      return undefined;
    }
    let total = 0;
    for (const p of pulls.values()) total += p.n * coinValue(priceFor(pricing.get(p.cardId), p.finish, p.firstEdition), p.rarity).coins;
    const value = Math.round(total / PACKS);
    const tier = setTier(set.id);
    const price = packPrice(value);
    console.log(`${set.id.padEnd(10)} ${set.name.slice(0, 28).padEnd(28)} ${tier.padEnd(9)} value ${String(value).padStart(6)}  price ${String(price).padStart(6)}`);
    return [set.id, { value, price }];
  } catch (err) {
    console.warn(`${set.id.padEnd(10)} skipped: ${String(err)}`);
    return undefined;
  }
});

const priced = Object.fromEntries(rows.filter((r): r is [string, ShopEntry] => !!r).sort((a, b) => a[0].localeCompare(b[0])));
await writeFile(OUT, JSON.stringify({ generated: new Date().toISOString().slice(0, 10), packs: PACKS, sets: priced }, null, 1) + "\n");
console.log(`\nWrote ${Object.keys(priced).length} sets.`);
summarize(priced);

function summarize(sets: Record<string, ShopEntry>) {
  for (const t of TIERS) {
    const prices = Object.entries(sets)
      .filter(([id]) => setTier(id) === t.id)
      .map(([, e]) => e.price)
      .sort((a, b) => a - b);
    if (prices.length) console.log(`${t.name}: ${prices.length} sets, ${prices[0]}–${prices[prices.length - 1]} coins (median ${prices[prices.length >> 1]})`);
  }
}
