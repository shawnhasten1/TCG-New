// How exciting a pull is, for reveal effects. 0 = nothing special, 3 = chase card.

import type { PulledCard } from "./types";

export type Tier = 0 | 1 | 2 | 3;

const CHASE = /illustration|secret|hyper|shiny ultra|gold|rainbow/i;
const ULTRA = /double|ultra|\bv\b|vmax|vstar|lv\.x|prime|legend|radiant|amazing|ace spec|shiny|classic collection|black white/i;
const RARE = /rare/i;

export function rarityTier(rarity: string): Tier {
  if (CHASE.test(rarity)) return 3;
  if (ULTRA.test(rarity)) return 2;
  if (RARE.test(rarity)) return 1;
  return 0;
}

/** Tier of a pull: a holo common or uncommon counts as a small hit. */
export function pullTier(pull: PulledCard): Tier {
  const t = rarityTier(pull.card.rarity);
  return t === 0 && pull.finish === "holo" ? 1 : t;
}
