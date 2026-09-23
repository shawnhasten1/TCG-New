// How rare it is to get a pack from each set. Tiers come from market data (scripts/setRarity.ts):
// sets whose commons sell for more are scarcer. A pack first rolls a tier by TIERS odds, then a set
// within it, so a scarce set turns up rarely however many sets share its tier.
// Pity: a long run without a rare-or-better (or legendary) set guarantees one on the next pack.

import data from "./setRarity.json";

export type SetTier = "common" | "uncommon" | "rare" | "legendary";

/** Tiers, most to least likely, with the share of packs that come from each. */
export const TIERS: { id: SetTier; name: string; odds: number }[] = [
  { id: "common", name: "Common set", odds: 70 },
  { id: "uncommon", name: "Uncommon set", odds: 22 },
  { id: "rare", name: "Rare set", odds: 7 },
  { id: "legendary", name: "Legendary set", odds: 1 },
];

/** Every Nth pack at the latest is from a set of at least this tier. */
export const PITY: { tier: SetTier; every: number }[] = [
  { tier: "legendary", every: 100 },
  { tier: "rare", every: 10 },
];

const sets = (data as { sets: Record<string, { tier: SetTier }> }).sets;

/** A set's tier; sets without market data (e.g. newer than the data) are "common". */
export function setTier(id: string): SetTier {
  return sets[id]?.tier ?? "common";
}

export function tierInfo(id: SetTier) {
  return TIERS.find((t) => t.id === id)!;
}

const rank = (t: SetTier) => TIERS.findIndex((x) => x.id === t);

/**
 * The lowest tier the next pack must be, given the sets of past packs (oldest first),
 * or undefined when no guarantee is due.
 */
export function pityFloor(history: string[], tierOf: (id: string) => SetTier = setTier): SetTier | undefined {
  for (const { tier, every } of PITY) {
    let since = 0;
    for (let i = history.length - 1; i >= 0 && rank(tierOf(history[i])) < rank(tier); i--) since++;
    if (since >= every - 1) return tier;
  }
  return undefined;
}

/**
 * Each set's chance of being drawn from `ids`: its tier's odds split across that tier's sets.
 * Tiers with no sets in the pool drop out and the rest scale up to fill 100%.
 * With a `floor`, tiers below it are ruled out and their odds go to the floor tier, so a guaranteed
 * rare leaves the legendary chance as it was. A floor the pool can't meet (e.g. era-limited) is ignored.
 */
export function drawWeights(ids: string[], tierOf: (id: string) => SetTier = setTier, floor?: SetTier): number[] {
  const tiers = ids.map(tierOf);
  const count = new Map<SetTier, number>();
  for (const t of tiers) count.set(t, (count.get(t) ?? 0) + 1);
  const odds = new Map(TIERS.filter((t) => count.has(t.id)).map((t) => [t.id, t.odds]));
  const eligible = floor ? [...odds.keys()].filter((t) => rank(t) >= rank(floor)) : [];
  if (eligible.length) {
    let moved = 0;
    for (const [t, o] of odds) if (!eligible.includes(t)) (moved += o), odds.set(t, 0);
    odds.set(eligible[0], odds.get(eligible[0])! + moved);
  }
  const raw = tiers.map((t) => odds.get(t)! / count.get(t)!);
  const total = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => w / total);
}
