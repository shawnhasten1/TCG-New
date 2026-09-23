// Pack engine: pure functions, no UI. openPack(setData, profile, rng) → PulledCard[].

import type { Card, SetData } from "../api/types";
import { pickOne, weightedPick, type Rng } from "./rng";
import type { Finish, PackProfile, PulledCard, SlotProfile } from "./types";

export const REVERSE = "@reverse";

interface PreparedSlot {
  slot: SlotProfile;
  /** Selector → weight, with selectors that match no cards removed. */
  table: Record<string, number>;
}

export interface PreparedPack {
  profile: PackProfile;
  slots: PreparedSlot[];
  pools: Map<string, Card[]>;
  /** True when no card in the set has holo or reverse flags, so flags can't be trusted. */
  variantDataMissing: boolean;
  /** Set rarities that no slot can ever produce. */
  unusedRarities: string[];
  /** Slots whose table matched nothing in this set. Non-empty means the set can't be opened. */
  emptySlots: string[];
  /** Cards per pack, from the profile. */
  packSize: number;
  /** Cards with an image, i.e. the ones that can be pulled. */
  imagedCards: number;
}

const hasImage = (c: Card) => !!c.image;

function selectPool(selector: string, cards: Card[], profile: PackProfile, variantDataMissing: boolean): Card[] {
  if (selector === REVERSE) {
    const flagged = cards.filter((c) => c.variants.reverse);
    if (flagged.length || !variantDataMissing) return flagged;
    const fallback = new Set(profile.reverseFallback ?? []);
    return cards.filter((c) => fallback.has(c.rarity));
  }
  const [rarity, qualifier] = selector.split("#");
  const ofRarity = cards.filter((c) => c.rarity === rarity);
  if (qualifier === "holo") return ofRarity.filter((c) => c.variants.holo && !c.variants.normal);
  if (qualifier === "nonholo") return ofRarity.filter((c) => c.variants.normal);
  return ofRarity;
}

const prepared = new WeakMap<SetData, WeakMap<PackProfile, PreparedPack>>();

/** Builds (and memoizes) the card pools for a set + profile. */
export function preparePack(data: SetData, profile: PackProfile): PreparedPack {
  let byProfile = prepared.get(data);
  if (!byProfile) prepared.set(data, (byProfile = new WeakMap()));
  const hit = byProfile.get(profile);
  if (hit) return hit;

  const cards = data.cards.filter(hasImage);
  const variantDataMissing = !cards.some((c) => c.variants.holo || c.variants.reverse);
  const pools = new Map<string, Card[]>();
  const slots: PreparedSlot[] = profile.slots.map((slot) => {
    const table: Record<string, number> = {};
    for (const [selector, weight] of Object.entries(slot.table)) {
      if (!(weight > 0)) continue;
      if (!pools.has(selector)) pools.set(selector, selectPool(selector, cards, profile, variantDataMissing));
      if (pools.get(selector)!.length) table[selector] = weight;
    }
    return { slot, table };
  });

  const reachable = new Set<string>();
  for (const s of slots) for (const sel of Object.keys(s.table)) for (const c of pools.get(sel)!) reachable.add(c.rarity);
  const unusedRarities = [...new Set(cards.map((c) => c.rarity))].filter((r) => !reachable.has(r));
  const emptySlots = slots.filter((s) => s.slot.count > 0 && !Object.keys(s.table).length).map((s) => s.slot.label);

  const packSize = profile.slots.reduce((n, s) => n + s.count, 0);
  const result = { profile, slots, pools, variantDataMissing, unusedRarities, emptySlots, packSize, imagedCards: cards.length };
  byProfile.set(profile, result);
  return result;
}

/** Why a set can't be opened with a profile, or undefined if it can. */
export function whyNotOpenable(data: SetData, profile: PackProfile): string | undefined {
  const prep = preparePack(data, profile);
  if (prep.imagedCards < prep.packSize) return `Only ${prep.imagedCards} cards have images, not enough to fill a pack`;
  if (prep.emptySlots.length) return `No cards for the ${prep.emptySlots.join(", ")} slot`;
  return undefined;
}

export function canOpen(data: SetData, profile: PackProfile): boolean {
  return whyNotOpenable(data, profile) === undefined;
}

function rollFinish(card: Card, slot: SlotProfile, outcome: string, rng: Rng, variantDataMissing: boolean): Finish {
  const v = card.variants;
  const odds = slot.finishOverrides?.[outcome] ?? slot.finish ?? { normal: 1, holo: 0 };
  const allowed = {
    normal: variantDataMissing || v.normal ? odds.normal ?? 0 : 0,
    holo: variantDataMissing || v.holo ? odds.holo ?? 0 : 0,
  };
  const picked = weightedPick(rng, allowed);
  if (picked) return picked;
  // The slot's preferred finishes aren't available for this card: use what it has.
  if (v.normal && !v.holo) return "normal";
  if (v.holo) return "holo";
  if (v.reverse) return "reverse";
  return "normal";
}

/**
 * Opens one pack. Cards come back in profile slot order, which is also reveal order
 * (profiles list commons first and the rare slot last).
 */
export function openPack(data: SetData, profile: PackProfile, rng: Rng = Math.random): PulledCard[] {
  const prep = preparePack(data, profile);
  if (prep.emptySlots.length) {
    throw new Error(`${data.set.id} can't fill slot(s) ${prep.emptySlots.join(", ")} with profile ${profile.id}`);
  }
  const firstEdition = rng() < (profile.firstEditionChance ?? 0);
  const seen = new Set<string>();
  const out: PulledCard[] = [];

  for (const { slot, table } of prep.slots) {
    for (let i = 0; i < slot.count; i++) {
      const outcome = weightedPick(rng, table)!;
      const pool = prep.pools.get(outcome)!;
      // Avoid duplicates within a pack when the pool allows it.
      const fresh = pool.filter((c) => !seen.has(c.id));
      const card = pickOne(rng, fresh.length ? fresh : pool);
      seen.add(card.id);
      const finish = outcome === REVERSE ? "reverse" : rollFinish(card, slot, outcome, rng, prep.variantDataMissing);
      out.push({
        card,
        finish,
        firstEdition: firstEdition && card.variants.firstEdition,
        slot: slot.label,
        outcome,
      });
    }
  }
  return out;
}
