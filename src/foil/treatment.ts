// Which foil treatment a pulled card gets, from its finish and rarity.

import type { Finish } from "../engine/types";

export type Treatment = "none" | "holo" | "reverse" | "fullart" | "etched";
export type Tint = "rainbow" | "gold";

/** Textured full-card foil: full-art ultra rares, secrets, hypers. */
const ETCHED = /ultra|secret|hyper|gold|rainbow/i;
/** Softer full-card foil plus glitter: illustration rares and rule-box cards. */
const FULLART = /illustration|full art|double|\bv\b|vmax|vstar|lv\.x|prime|legend|radiant|amazing|ace spec|shiny|classic collection|black white|\bex\b|\bgx\b/i;
const GOLD = /hyper|gold/i;

export function foilTreatment(finish: Finish, rarity: string): Treatment {
  if (finish === "reverse") return "reverse";
  if (finish === "normal") return "none";
  if (ETCHED.test(rarity)) return "etched";
  if (FULLART.test(rarity)) return "fullart";
  return "holo";
}

export function foilTint(rarity: string): Tint {
  return GOLD.test(rarity) ? "gold" : "rainbow";
}
