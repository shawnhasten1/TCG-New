// Writes src/mtg/packArt.json: the designs each Magic set's packs come in. Magic has no pack photos (yet), so wrappers
// are drawn (src/mtg/wrapper.ts), each around the art of one of the set's cards, as real boosters feature their sets'
// cards. For each set it picks up to ARTS rares and mythics (uncommons if it has none) from the main set, the most
// valuable first, one per name.
// Packs keep the design they came in (by collector number), so re-running only adds designs for new sets: a set
// already in the file keeps its designs.
// Usage: npm run mtg-pack-art   (after adding sets; Scryfall's answers are cached per day in .cache)
import { readFile, writeFile } from "node:fs/promises";
import { toSetData } from "../src/mtg/cards";
import type { MtgArt } from "../src/mtg/packArt";
import { MTG_SETS } from "../src/mtg/sets";
import { USD_PER_EUR } from "../src/market/protocol";
import { rawCards } from "./scryfall";

const ARTS = 4;
const OUT = "src/mtg/packArt.json";

const existing = JSON.parse(await readFile(OUT, "utf8").catch(() => "{}")) as Record<string, MtgArt[]>;
const out: Record<string, MtgArt[]> = {};

for (const set of MTG_SETS) {
  if (existing[set.id]?.length) {
    out[set.id] = existing[set.id];
    continue;
  }
  const raw = await rawCards(set);
  const official = toSetData(set, raw).set.cardCount.official;
  const value = (c: (typeof raw)[number]) => Math.max(Number(c.prices?.usd ?? 0), Number(c.prices?.eur ?? 0) * USD_PER_EUR, Number(c.prices?.usd_foil ?? 0) / 3);
  const picks: MtgArt[] = [];
  const names = new Set<string>();
  const main = raw.filter((c) => /^\d+$/.test(c.collector_number) && Number(c.collector_number) <= official);
  // Renaissance has no rares, so its uncommons stand in.
  const rares = main.filter((c) => c.rarity === "rare" || c.rarity === "mythic");
  for (const c of (rares.length ? rares : main.filter((c) => c.rarity === "uncommon")).sort((a, b) => value(b) - value(a))) {
    if (picks.length >= ARTS) break;
    if (names.has(c.name)) continue;
    names.add(c.name);
    picks.push({ id: c.collector_number, name: c.name.split(" // ")[0], scryfallId: c.id, artist: c.artist ?? "" });
  }
  out[set.id] = picks;
  console.log(`${set.id.padEnd(5)} ${picks.map((p) => p.name).join(", ")}`);
}

await writeFile(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`\nWrote ${Object.keys(out).length} sets.`);
