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
  /** Cards that can be pulled: imaged, and not excluded basic energy. */
  imagedCards: number;
  /** Basic energies left out of the pools (see PackProfile.includeBasicEnergy). */
  excludedEnergy: number;
}

const hasImage = (c: Card) => !!c.image;

/**
 * A plain basic energy: the filler card real packs carry outside the 10 playable cards.
 * Gold / hyper-rare basic energies are chase cards, so anything with a "rare" rarity stays in.
 */
export function isFillerEnergy(c: Card): boolean {
  return c.category === "Energy" && c.energyType === "Normal" && !/rare/i.test(c.rarity);
}

/**
 * Whether a card belongs in a selector's pool. `variantDataMissing` is set-wide: no card in the
 * set has holo or reverse flags (BW/XY/SM on TCGdex), so reverse slots fall back to rarities.
 */
function inPool(card: Card, selector: string, profile: PackProfile, variantDataMissing: boolean): boolean {
  if (selector === REVERSE) return variantDataMissing ? (profile.reverseFallback ?? []).includes(card.rarity) : card.variants.reverse;
  const [rarity, qualifier] = selector.split("#");
  if (card.rarity !== rarity) return false;
  if (qualifier === "holo") return card.variants.holo && !card.variants.normal;
  if (qualifier === "nonholo") return card.variants.normal;
  return true;
}

function selectPool(selector: string, cards: Card[], profile: PackProfile, variantDataMissing: boolean): Card[] {
  return cards.filter((c) => inPool(c, selector, profile, variantDataMissing));
}

const prepared = new WeakMap<SetData, WeakMap<PackProfile, PreparedPack>>();

/** Builds (and memoizes) the card pools for a set + profile. */
export function preparePack(data: SetData, profile: PackProfile): PreparedPack {
  let byProfile = prepared.get(data);
  if (!byProfile) prepared.set(data, (byProfile = new WeakMap()));
  const hit = byProfile.get(profile);
  if (hit) return hit;

  const imaged = data.cards.filter(hasImage);
  const cards = profile.includeBasicEnergy ? imaged : imaged.filter((c) => !isFillerEnergy(c));
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
  const excludedEnergy = imaged.length - cards.length;
  const result = { profile, slots, pools, variantDataMissing, unusedRarities, emptySlots, packSize, imagedCards: cards.length, excludedEnergy };
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

/** Normal/holo odds for a card picked by a rarity selector, limited to the printings it has. */
function finishWeights(card: Card, slot: SlotProfile, outcome: string, variantDataMissing: boolean): Record<"normal" | "holo", number> {
  const v = card.variants;
  const odds = slot.finishOverrides?.[outcome] ?? slot.finish ?? { normal: 1, holo: 0 };
  return {
    normal: variantDataMissing || v.normal ? odds.normal ?? 0 : 0,
    holo: variantDataMissing || v.holo ? odds.holo ?? 0 : 0,
  };
}

/** When the slot's preferred finishes aren't available for this card: use what it has. */
function fallbackFinish(card: Card): Finish {
  const v = card.variants;
  if (v.normal && !v.holo) return "normal";
  if (v.holo) return "holo";
  if (v.reverse) return "reverse";
  return "normal";
}

function rollFinish(card: Card, slot: SlotProfile, outcome: string, rng: Rng, variantDataMissing: boolean): Finish {
  return weightedPick(rng, finishWeights(card, slot, outcome, variantDataMissing)) ?? fallbackFinish(card);
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

/** Ids of every card this profile can put in a pack (for collection completion). */
export function pullableCardIds(data: SetData, profile: PackProfile): Set<string> {
  const prep = preparePack(data, profile);
  const ids = new Set<string>();
  for (const s of prep.slots) for (const sel of Object.keys(s.table)) for (const c of prep.pools.get(sel)!) ids.add(c.id);
  return ids;
}

/**
 * Every finish this card can come out of a pack in, using the same pools and finish rules as
 * openPack. Printing flags alone aren't enough: a slot's odds can rule a printing out (the SV rare
 * slot is always holo, common slots never give holo commons). Empty when packs can't give the card.
 * Pass the set's `variantDataMissing` (see PreparedPack) when known.
 */
export function packFinishes(card: Card, profile: PackProfile, variantDataMissing: boolean): Finish[] {
  if (!hasImage(card) || (!profile.includeBasicEnergy && isFillerEnergy(card))) return [];
  const out = new Set<Finish>();
  for (const slot of profile.slots) {
    if (!(slot.count > 0)) continue;
    for (const [selector, weight] of Object.entries(slot.table)) {
      if (!(weight > 0) || !inPool(card, selector, profile, variantDataMissing)) continue;
      if (selector === REVERSE) {
        out.add("reverse");
        continue;
      }
      const w = finishWeights(card, slot, selector, variantDataMissing);
      if (w.normal > 0) out.add("normal");
      if (w.holo > 0) out.add("holo");
      if (!(w.normal > 0) && !(w.holo > 0)) out.add(fallbackFinish(card));
    }
  }
  return (["normal", "holo", "reverse"] as Finish[]).filter((f) => out.has(f));
}

/** Whether packs can give this card as 1st Edition. */
export function packFirstEdition(card: Card, profile: PackProfile): boolean {
  return card.variants.firstEdition && (profile.firstEditionChance ?? 0) > 0;
}
