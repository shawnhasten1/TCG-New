// Writes src/ygo/setRarity.json: how scarce each Yu-Gi-Oh! set is, from what its plainest cards sell for (see
// scripts/tiering.ts), so packs come from scarcer sets less often, with pity, as in Pokémon and Magic.
// Many Yu-Gi-Oh! products have no commons (Battles of Legend is all Ultra and Secret Rares), so each set samples up to
// SAMPLE cards of its plainest rarity and is ranked only against sets whose plainest rarity is the same: commons
// against commons, Super Rares against Super Rares. Prices are each printing's TCGplayer price from YGOPRODeck.
// The app ships the JSON; sets missing from it (e.g. added since the last run) count as "common".
// Usage: npm run ygo-set-rarity   (re-run after adding sets; YGOPRODeck's answers are cached per day in .cache)
import { writeFile } from "node:fs/promises";
import { priceFor } from "../src/collection/prices";
import { rarityRank, toPricing, toSetData } from "../src/ygo/cards";
import { YGO_SETS } from "../src/ygo/sets";
import { rawCards, today } from "./ygoprodeck";
import { assignTiers, median, printTiers, spread, type PricedSet, type TierEntry } from "./tiering";

const SAMPLE = 25;
/** A rarity needs this many cards in a set to be its plainest (a stray odd printing doesn't count). */
const ENOUGH = 5;

const groups = new Map<string, PricedSet[]>();
for (const set of YGO_SETS) {
  const raw = await rawCards(set);
  const data = toSetData(set, raw);
  const prices = toPricing(set, raw);
  const main = data.cards.filter((c) => /^\d+$/.test(c.localId));
  const plainest = Object.entries(data.byRarity)
    .filter(([, cards]) => cards.length >= ENOUGH)
    .sort((a, b) => rarityRank(a[0]) - rarityRank(b[0]))[0]?.[0];
  // Short Prints are commons.
  const group = plainest === "Short Print" || plainest === "Super Short Print" ? "Common" : (plainest ?? "none");
  const picks = spread(
    main.filter((c) => c.rarity === plainest),
    SAMPLE,
  );
  const usd = picks.map((c) => priceFor(prices[c.id], c.variants.holo ? "holo" : "normal")?.amount ?? 0);
  const row: PricedSet = { set, sampled: picks.length, usd: median(usd) };
  console.log(`${set.id.padEnd(5)} ${set.name.slice(0, 34).padEnd(34)} ${group.padEnd(22)} n=${String(picks.length).padStart(2)}  $${row.usd?.toFixed(2) ?? "–"}`);
  (groups.get(group) ?? groups.set(group, []).get(group)!).push(row);
}

const out: Record<string, TierEntry> = {};
for (const [group, rows] of groups) {
  console.log(`\n${group}: ${rows.length} sets`);
  Object.assign(out, assignTiers(rows));
  printTiers(rows, assignTiers(rows));
}
const sorted = Object.fromEntries(Object.entries(out).sort((a, b) => a[0].localeCompare(b[0])));
await writeFile("src/ygo/setRarity.json", JSON.stringify({ generated: today, sets: sorted }, null, 1) + "\n");
