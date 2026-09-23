// Opens N packs of a real set and reports pull rates.
// Usage: npm run simulate -- <setId> [packs=10000] [seed]
import { createClient } from "../src/api/tcgdex";
import { fileCache } from "./fileCache";
import { profileFor } from "../src/engine/profiles";
import { simulate } from "../src/engine/simulate";

const [id, n = "10000", seed = "simulate"] = process.argv.slice(2);
if (!id) {
  console.error("Usage: npm run simulate -- <setId> [packs=10000] [seed]");
  process.exit(1);
}

const data = await createClient(fileCache()).getSetCards(id);
const profile = profileFor(data.set);
if (!profile) {
  console.error(`No pack profile for serie "${data.set.serie.id}"`);
  process.exit(1);
}

const report = simulate(data, profile, Number(n), seed);
const fmt = (s: { key: string; perPack: number; oneIn: number }) => ({
  outcome: s.key,
  "per pack": s.perPack.toFixed(3),
  "≥1 in N packs": s.oneIn === Infinity ? "-" : s.oneIn.toFixed(1),
});
console.log(`\n${data.set.name} (${id}) · profile ${profile.id} · ${report.packs} packs · seed "${seed}"`);
if (report.variantDataMissing) console.log("⚠ No variant data in this set: finishes come from profile odds, not card flags.");
if (report.unusedRarities.length) console.log(`⚠ Rarities no slot can produce: ${report.unusedRarities.join(", ")}`);
console.log("\nAll slots:");
console.table(report.byRarity.map(fmt));
for (const [slot, stats] of Object.entries(report.bySlot)) {
  if (stats.length < 2) continue;
  console.log(`\nSlot "${slot}":`);
  console.table(stats.map(fmt));
}
