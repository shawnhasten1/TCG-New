import type { Card } from "../api/types";

export type Finish = "normal" | "holo" | "reverse";

export type FinishOdds = Partial<Record<"normal" | "holo", number>>;

/**
 * One slot in a pack. `table` maps an outcome selector to a weight:
 *   "Rare"          – any card with that exact TCGdex rarity
 *   "Rare#holo"     – that rarity, holo-only printings (variants.holo && !variants.normal)
 *   "Rare#nonholo"  – that rarity, cards that have a normal printing
 *   "@reverse"      – any reverse-eligible card, finish forced to reverse
 * Selectors that match no cards in the set are dropped and the rest renormalized.
 */
export interface SlotProfile {
  label: string;
  count: number;
  table: Record<string, number>;
  /**
   * Finish odds for cards picked by a rarity selector. Limited to the finishes the card
   * actually has (unless the set has no variant data). Default: normal if possible, else holo.
   */
  finish?: FinishOdds;
  /** Per-selector finish odds, e.g. { "Ultra Rare": { "holo": 1 } }. Wins over `finish`. */
  finishOverrides?: Record<string, FinishOdds>;
}

/**
 * A pack profile. Slots are listed in pack order, which is also reveal order. Per Pokémon's
 * support site, cards come out commons first, then uncommons, then the foils, rare slot last.
 */
export interface PackProfile {
  id: string;
  name: string;
  /** TCGdex serie ids this profile applies to. */
  series: string[];
  /** Specific set ids this profile applies to, overriding the serie match. */
  sets?: string[];
  slots: SlotProfile[];
  /**
   * Rarities used for "@reverse" when a set has no reverse variant data at all
   * (TCGdex is missing variant flags for some older sets).
   */
  reverseFallback?: string[];
  /**
   * Keep plain basic energies (category Energy, energyType Normal, not rare) in the pools.
   * Off by default: real packs carry basic energy as an extra, non-playable card, and we
   * leave that card out rather than let energies take common slots.
   */
  includeBasicEnergy?: boolean;
  /** Chance a whole pack is 1st Edition, for cards that have a 1st Edition printing. */
  firstEditionChance?: number;
  notes?: string;
}

export interface PulledCard {
  card: Card;
  finish: Finish;
  firstEdition: boolean;
  /** Slot label from the profile. */
  slot: string;
  /** Selector that produced this card, e.g. "Rare#holo" or "@reverse". */
  outcome: string;
}
