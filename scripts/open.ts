// Opens one pack from a real set and prints the pulls.
// Usage: npm run open -- <setId> [seed]
import { createClient } from "../src/api/tcgdex";
import { fileCache } from "./fileCache";
import { openPack } from "../src/engine/openPack";
import { profileFor } from "../src/engine/profiles";
import { createRng } from "../src/engine/rng";

const [id, seed = String(Date.now())] = process.argv.slice(2);
if (!id) {
  console.error("Usage: npm run open -- <setId> [seed]");
  process.exit(1);
}
const data = await createClient(fileCache()).getSetCards(id);
const profile = profileFor(data.set);
if (!profile) throw new Error(`No pack profile for serie "${data.set.serie.id}"`);

console.log(`${data.set.name} · profile ${profile.id} · seed ${seed}`);
console.table(
  openPack(data, profile, createRng(seed)).map((p) => ({
    slot: p.slot,
    card: `${p.card.name} #${p.card.localId}`,
    rarity: p.card.rarity,
    finish: p.finish + (p.firstEdition ? " · 1st Ed" : ""),
  })),
);
