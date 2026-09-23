// Opens many packs and reports how often each outcome came out, to check odds match intent.

import type { SetData } from "../api/types";
import { openPack, preparePack } from "./openPack";
import { createRng } from "./rng";
import type { PackProfile } from "./types";

export interface OutcomeStat {
  /** Rarity plus finish, e.g. "Rare (holo)". */
  key: string;
  /** Total cards pulled. */
  cards: number;
  /** Packs containing at least one. */
  packs: number;
  /** Average number per pack. */
  perPack: number;
  /** "1 in N packs" for at least one. */
  oneIn: number;
}

export interface SimulationReport {
  setId: string;
  profileId: string;
  packs: number;
  seed: string;
  byRarity: OutcomeStat[];
  bySlot: Record<string, OutcomeStat[]>;
  unusedRarities: string[];
  variantDataMissing: boolean;
}

function toStats(cards: Map<string, number>, packs: Map<string, number>, n: number): OutcomeStat[] {
  return [...cards.entries()]
    .map(([key, count]) => {
      const p = packs.get(key) ?? 0;
      return { key, cards: count, packs: p, perPack: count / n, oneIn: p ? n / p : Infinity };
    })
    .sort((a, b) => b.perPack - a.perPack);
}

export function simulate(data: SetData, profile: PackProfile, packs = 10_000, seed = "simulate"): SimulationReport {
  const rng = createRng(seed);
  const rarityCards = new Map<string, number>();
  const rarityPacks = new Map<string, number>();
  const slotCards = new Map<string, Map<string, number>>();
  const slotPacks = new Map<string, Map<string, number>>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  const sub = (m: Map<string, Map<string, number>>, k: string) => m.get(k) ?? m.set(k, new Map()).get(k)!;

  for (let i = 0; i < packs; i++) {
    const seenRarity = new Set<string>();
    const seenSlot = new Set<string>();
    for (const pull of openPack(data, profile, rng)) {
      const key = `${pull.card.rarity} (${pull.finish})`;
      bump(rarityCards, key);
      if (!seenRarity.has(key)) bump(rarityPacks, key), seenRarity.add(key);
      bump(sub(slotCards, pull.slot), key);
      if (!seenSlot.has(pull.slot + key)) bump(sub(slotPacks, pull.slot), key), seenSlot.add(pull.slot + key);
    }
  }

  const prep = preparePack(data, profile);
  const bySlot: Record<string, OutcomeStat[]> = {};
  for (const [slot, m] of slotCards) bySlot[slot] = toStats(m, slotPacks.get(slot)!, packs);
  return {
    setId: data.set.id,
    profileId: profile.id,
    packs,
    seed,
    byRarity: toStats(rarityCards, rarityPacks, packs),
    bySlot,
    unusedRarities: prep.unusedRarities,
    variantDataMissing: prep.variantDataMissing,
  };
}
