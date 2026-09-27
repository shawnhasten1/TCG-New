// How Magic foils shine: a traditional foil, the whole card in one smooth rainbow sheen with no texture or glitter
// (the "traditional" treatment in foil.css). The finish is what makes a card foil (the pack's foil slot), not its
// rarity, so every rarity looks the same; what changes is the era (sets.ts foilEra):
// - premodern: the shine sits on the frame, with the art and text box much dimmer, and a shooting star in the text box;
// - dark: the same sheen as modern, darker;
// - modern: the plain traditional foil.

import type { RarityFoil } from "../foil/layouts";
import type { MtgFoilEra } from "./sets";

export function mtgFoil(era: MtgFoilEra): RarityFoil {
  if (era === "premodern") return { treatment: "traditional", era, mark: "star" };
  if (era === "dark") return { treatment: "traditional", era };
  return { treatment: "traditional" };
}
