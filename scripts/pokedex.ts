// One-off: writes src/collection/pokedex.json (National Pokédex number → English name) from PokéAPI.
// The app ships the JSON, so it has no runtime dependency on PokéAPI. Re-run when new Pokémon appear.
// Usage: npm run pokedex
import { writeFile } from "node:fs/promises";

const query = `{ pokemon_v2_pokemonspeciesname(where:{language_id:{_eq:9}}, order_by:{pokemon_species_id:asc}) { name pokemon_species_id } }`;
const res = await fetch("https://beta.pokeapi.co/graphql/v1beta", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ query }),
});
if (!res.ok) throw new Error(`PokéAPI ${res.status}`);
const rows = ((await res.json()) as { data: { pokemon_v2_pokemonspeciesname: { name: string; pokemon_species_id: number }[] } }).data.pokemon_v2_pokemonspeciesname;
const names: Record<string, string> = {};
for (const r of rows) names[r.pokemon_species_id] = r.name;
await writeFile("src/collection/pokedex.json", JSON.stringify(names, null, 0) + "\n");
console.log(`Wrote ${rows.length} Pokémon names.`);
