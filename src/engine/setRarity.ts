// How rare it is to get a pack from each set. Tiers come from market data (scripts/setRarity.ts):
// sets whose commons sell for more are scarcer. A pack first rolls a tier by TIERS odds, then a set
// within it, so a scarce set turns up rarely however many sets share its tier.

import data from "./setRarity.json";

export type SetTier = "common" | "uncommon" | "rare" | "legendary";

/** Tiers, most to least likely, with the share of packs that come from each. */
export const TIERS: { id: SetTier; name: string; odds: number }[] = [
  { id: "common", name: "Common set", odds: 70 },
  { id: "uncommon", name: "Uncommon set", odds: 22 },
  { id: "rare", name: "Rare set", odds: 7 },
  { id: "legendary", name: "Legendary set", odds: 1 },
];

const sets = (data as { sets: Record<string, { tier: SetTier }> }).sets;

/** A set's tier; sets without market data (e.g. newer than the data) are "common". */
export function setTier(id: string): SetTier {
  return sets[id]?.tier ?? "common";
}

export function tierInfo(id: SetTier) {
  return TIERS.find((t) => t.id === id)!;
}

/**
 * Each set's chance of being drawn from `ids`: its tier's odds split across that tier's sets.
 * Tiers with no sets in the pool drop out and the rest scale up to fill 100%.
 */
export function drawWeights(ids: string[], tierOf: (id: string) => SetTier = setTier): number[] {
  const tiers = ids.map(tierOf);
  const count = new Map<SetTier, number>();
  for (const t of tiers) count.set(t, (count.get(t) ?? 0) + 1);
  const raw = tiers.map((t) => tierInfo(t).odds / count.get(t)!);
  const total = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => w / total);
}
