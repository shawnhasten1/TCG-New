// How Yu-Gi-Oh! rarities shine. Unlike Pokémon, the finish comes with the rarity: Super, Ultra and Secret Rares foil
// the art box (Secret with a diagonal rainbow), and the collector rarities and parallel prints (Duel Terminal, Starfoil,
// Mosaic, Shatterfoil) foil the whole card. Two have looks of their own:
// - Ultimate Rare (2004–2015): the art, border, attribute and stars embossed in a pale silver foil, text box left plain;
// - Ghost Rare (2008 on): a pale, silvery holographic art box whose picture looks washed out, like a ghost.
// Rare and up also print the card's name in foil (ygoNameFoil).

import type { NameFoil, RarityFoil } from "../foil/layouts";

export function ygoFoil(rarity: string): RarityFoil | undefined {
  if (/ghost/i.test(rarity)) return { treatment: "holo", look: "ghost" };
  if (/quarter century|starlight|collector|platinum|prismatic|parallel|starfoil|mosaic|shatterfoil/i.test(rarity)) return { treatment: "etched", tint: "rainbow" };
  if (/gold/i.test(rarity)) return { treatment: "etched", tint: "gold" };
  if (/secret/i.test(rarity)) return { treatment: "holo", holo: "tinsel" };
  if (/ultimate/i.test(rarity)) return { treatment: "etched", look: "ultimate" };
  if (/pharaoh/i.test(rarity)) return { treatment: "etched", tint: "gold" };
  if (/ultra/i.test(rarity)) return { treatment: "holo", holo: "sheen" };
  if (/super/i.test(rarity)) return { treatment: "holo", holo: "smooth" };
  return undefined;
}

/** The foil the name is printed in: gold for Ultra and the gold rarities, silver for Rare, Secret, Ghost and Platinum.
 *  Super Rares and the whole-card foils keep a plain name. */
export function ygoNameFoil(rarity: string): NameFoil | undefined {
  if (/ultra|gold|pharaoh/i.test(rarity)) return "gold";
  if (/^rare$|secret|ghost|platinum|rare parallel/i.test(rarity)) return "silver";
  return undefined;
}
