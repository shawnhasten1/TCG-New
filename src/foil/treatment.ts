// Which foil treatment a pulled card gets, from its finish and rarity.
// Treatment decides which layers exist and where the foil goes; style swaps in a rarity's own shine pattern.

import type { Card } from "../api/types";
import type { Finish } from "../engine/types";

export type Treatment = "none" | "holo" | "reverse" | "fullart" | "etched";
export type Tint = "rainbow" | "gold";
export type Style = "cosmos" | "radiant" | "amazing" | "shiny" | "rainbow" | "v" | "vmax" | "acespec" | "double" | "illustration" | "special" | "ultra";

/** Textured full-card foil: full-art ultra rares, special illustration rares, secrets, hypers. */
const ETCHED = /ultra|special illustration|secret|hyper|gold|rainbow/i;
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

type Kind = Pick<Card, "category" | "trainerType">;

/** Gold for hyper rares, and for secret rares that are Items, Tools, Stadiums or Energy: the SM/SWSH
 *  gold cards. Secret Pokémon and Supporters are the rainbow ones. */
export function foilTint(rarity: string, kind: Kind = {}): Tint {
  if (GOLD.test(rarity)) return "gold";
  if (/secret/i.test(rarity)) {
    if (kind.category === "Energy") return "gold";
    if (kind.category === "Trainer" && kind.trainerType && !/supporter/i.test(kind.trainerType)) return "gold";
  }
  return "rainbow";
}

/** The rarity's own foil pattern, if it has one. Only for holo pulls: reverse holos look the same across rarities. */
export function foilStyle(finish: Finish, rarity: string, kind: Kind = {}): Style | undefined {
  if (finish !== "holo") return undefined;
  if (/radiant/i.test(rarity)) return "radiant";
  if (/amazing/i.test(rarity)) return "amazing";
  if (/shiny/i.test(rarity)) return "shiny";
  if (/ace spec/i.test(rarity)) return "acespec";
  if (/vmax|vstar/i.test(rarity)) return "vmax";
  if (/\bv\b/i.test(rarity)) return "v";
  if (/promo/i.test(rarity)) return "cosmos";
  if (/secret/i.test(rarity) && foilTint(rarity, kind) === "rainbow") return "rainbow";
  // Scarlet & Violet's own tiers: ex get a star-like sheen, illustration rares are smooth,
  // special illustration and ultra rares are textured (the gold hypers keep the gold tint).
  if (/double/i.test(rarity)) return "double";
  if (/special illustration/i.test(rarity)) return "special";
  if (/illustration/i.test(rarity)) return "illustration";
  if (/ultra/i.test(rarity)) return "ultra";
  return undefined;
}
