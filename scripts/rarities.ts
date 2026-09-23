// Lists the distinct rarities in one or more sets, with variant counts.
// Usage: npm run rarities -- sv03.5 swsh7 base1
import { createClient } from "../src/api/tcgdex";
import { fileCache } from "./fileCache";

const ids = process.argv.slice(2);
if (!ids.length) {
  console.error("Usage: npm run rarities -- <setId> [setId...]");
  process.exit(1);
}

const client = createClient(fileCache());
for (const id of ids) {
  const data = await client.getSetCards(id);
  const { set } = data;
  console.log(`\n${set.name} (${set.id}) · serie ${set.serie.id} · ${set.releaseDate ?? "?"} · ${data.cards.length} cards via ${data.source}`);
  const rows = Object.entries(data.byRarity).map(([rarity, cards]) => ({
    rarity,
    count: cards.length,
    pokemon: cards.filter((c) => c.category === "Pokemon").length,
    trainer: cards.filter((c) => c.category === "Trainer").length,
    energy: cards.filter((c) => c.category === "Energy").length,
    normal: cards.filter((c) => c.variants.normal).length,
    holo: cards.filter((c) => c.variants.holo).length,
    reverse: cards.filter((c) => c.variants.reverse).length,
    firstEd: cards.filter((c) => c.variants.firstEdition).length,
    noImage: cards.filter((c) => !c.image).length,
  }));
  console.table(rows);
}
