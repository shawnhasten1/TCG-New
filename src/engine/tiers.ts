// How exciting a pull is, for reveal effects. 0 = nothing special, 3 = chase card.

import type { PulledCard } from "./types";

export type Tier = 0 | 1 | 2 | 3;

const CHASE = /illustration|secret|hyper|shiny ultra|gold|rainbow/i;
const ULTRA = /double|ultra|\bv\b|vmax|vstar|lv\.x|prime|legend|radiant|amazing|ace spec|shiny|classic collection|black white/i;
const RARE = /rare/i;

/** Tiers by rarity label. There are only a few dozen labels, and sorting thousands of cards asks over and over. */
const tierOf = new Map<string, Tier>();

export function rarityTier(rarity: string): Tier {
  let tier = tierOf.get(rarity);
  if (tier === undefined) {
    tier = CHASE.test(rarity) ? 3 : ULTRA.test(rarity) ? 2 : RARE.test(rarity) ? 1 : 0;
    tierOf.set(rarity, tier);
  }
  return tier;
}

export type RarityKind = "common" | "uncommon" | "rare" | "ultra" | "chase";

/** Color family for a rarity label; splits tier 0 into common and uncommon. */
export function rarityKind(rarity: string): RarityKind {
  const tier = rarityTier(rarity);
  if (tier === 3) return "chase";
  if (tier === 2) return "ultra";
  if (tier === 1) return "rare";
  return /uncommon/i.test(rarity) ? "uncommon" : "common";
}

/** Shiny Pokémon, from vault shinies to Shiny Ultra Rares. Celebrated on reveal whatever their tier. */
export function isShiny(rarity: string): boolean {
  return /shiny/i.test(rarity);
}

/** Look of the rarity tag on a revealed card: shinies get their own, otherwise the rarity's colour family. */
export function tagKind(rarity: string): RarityKind | "shiny" {
  return isShiny(rarity) ? "shiny" : rarityKind(rarity);
}

/** Tier of a pull: a holo common or uncommon counts as a small hit. */
export function pullTier(pull: PulledCard): Tier {
  const t = rarityTier(pull.card.rarity);
  return t === 0 && pull.finish === "holo" ? 1 : t;
}
