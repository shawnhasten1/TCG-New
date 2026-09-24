// Owned cards across every set, grouped by rarity or by finish, for the "By rarity" collection view.

import type { Card, SetDetail } from "../api/types";
import { rarityKind, type RarityKind } from "../engine/tiers";
import type { FinishKey } from "./pokedex";
import type { Ownership } from "./progress";
import type { PullRecord } from "./store";

export type GroupBy = "rarity" | "finish";

export interface OwnedCard {
  card: Card;
  set: SetDetail;
  owned: Ownership;
}

/** One card in a group. `finish` is set when the group or the filter is about a single finish. */
export interface Tile extends OwnedCard {
  finish?: FinishKey;
  /** Copies that fit the group and filter. */
  count: number;
}

export interface CardGroup {
  key: string;
  tiles: Tile[];
}

/** Rarest finish first. */
export const FINISH_ORDER: FinishKey[] = ["firstEdition", "holo", "reverse", "normal"];

export function finishCount(o: Ownership, f: FinishKey): number {
  return f === "firstEdition" ? o.firstEdition : o.byFinish[f];
}

export function pullHasFinish(p: PullRecord, f: FinishKey): boolean {
  return f === "firstEdition" ? p.firstEdition : p.finish === f;
}

const KIND_ORDER: RarityKind[] = ["chase", "ultra", "rare", "uncommon", "common"];

/** Rarities sorted rarest first (chase, ultra, rare, uncommon, common, then by name). */
export function sortRarities(rarities: Iterable<string>): string[] {
  const rank = (r: string) => KIND_ORDER.indexOf(rarityKind(r));
  return [...new Set(rarities)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export function groupCards(entries: OwnedCard[], opts: { groupBy: GroupBy; finish: FinishKey | "any"; rarity: string }): CardGroup[] {
  const inRarity = entries.filter((e) => opts.rarity === "all" || e.card.rarity === opts.rarity);

  if (opts.groupBy === "finish") {
    const finishes = opts.finish === "any" ? FINISH_ORDER : [opts.finish];
    return finishes
      .map((f) => ({
        key: f,
        tiles: inRarity.filter((e) => finishCount(e.owned, f) > 0).map((e) => ({ ...e, finish: f, count: finishCount(e.owned, f) })),
      }))
      .filter((g) => g.tiles.length);
  }

  const byRarity = new Map<string, Tile[]>();
  for (const e of inRarity) {
    const count = opts.finish === "any" ? e.owned.total : finishCount(e.owned, opts.finish);
    if (!count) continue;
    const tile: Tile = { ...e, count, finish: opts.finish === "any" ? undefined : opts.finish };
    (byRarity.get(e.card.rarity) ?? byRarity.set(e.card.rarity, []).get(e.card.rarity)!).push(tile);
  }
  return sortRarities(byRarity.keys()).map((key) => ({ key, tiles: byRarity.get(key)! }));
}
