// How Yu-Gi-Oh! rarities shine. Unlike Pokémon, the finish comes with the rarity: Super, Ultra and Secret Rares foil
// the art box (Ultra adds a gold name, Secret a diagonal rainbow), and the collector rarities and parallel prints
// (Duel Terminal, Starfoil, Mosaic, Shatterfoil) foil the whole card.

import type { RarityFoil } from "../foil/layouts";

export function ygoFoil(rarity: string): RarityFoil | undefined {
  if (/quarter century|starlight|collector|platinum|ghost|prismatic|parallel|starfoil|mosaic|shatterfoil/i.test(rarity)) return { treatment: "etched", tint: "rainbow" };
  if (/ultimate|gold|pharaoh/i.test(rarity)) return { treatment: "etched", tint: "gold" };
  if (/secret/i.test(rarity)) return { treatment: "holo", holo: "tinsel" };
  if (/ultra/i.test(rarity)) return { treatment: "holo", holo: "sheen" };
  if (/super/i.test(rarity)) return { treatment: "holo", holo: "smooth" };
  return undefined;
}
