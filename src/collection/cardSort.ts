// Sorting lists of owned cards, for the "All cards" collection view and the sell picker: by value, recency, Pokédex
// number, name, rarity or set.

import type { Card } from "../api/types";
import { rarityTier } from "../engine/tiers";

export type CardSort = "value" | "recent" | "dex" | "name" | "rarity" | "set";

export const CARD_SORT_LABEL: Record<CardSort, string> = { value: "Value", recent: "Recently pulled", dex: "Pokédex number", name: "Name", rarity: "Rarity", set: "Set" };

/** Anything with a card and its set, and when it was last pulled (on it, or on `owned` as in the collection views). */
export type Sortable = { card: Card; set: { releaseDate?: string } } & ({ owned: { lastPulledAt: string } } | { lastPulledAt: string });

/** Lowest National Pokédex number on the card; undefined for Trainers, Energy and cards TCGdex has no number for. */
export const dexNumber = (e: Pick<Sortable, "card">) => (e.card.dexId?.length ? Math.min(...e.card.dexId) : undefined);

const pulledAt = (e: Sortable) => ("owned" in e ? e.owned.lastPulledAt : e.lastPulledAt);
const recent = (a: Sortable, b: Sortable) => pulledAt(b).localeCompare(pulledAt(a));
const byName = (a: Sortable, b: Sortable) => a.card.name.localeCompare(b.card.name, undefined, { sensitivity: "base", numeric: true });
/** Newest set first, then card number: a stable last resort. */
const printing = (a: Sortable, b: Sortable) =>
  (b.set.releaseDate ?? "").localeCompare(a.set.releaseDate ?? "") || a.card.localId.localeCompare(b.card.localId, undefined, { numeric: true });

/**
 * Sorted copy of `entries`. Value is highest first (cards with no price last), recent is newest first,
 * Pokédex number is lowest first with non-Pokémon after (by name), name is A to Z, rarity is rarest first (then by
 * value), and set is newest set first in card-number order.
 */
export function sortCards<T extends Sortable>(entries: T[], sort: CardSort, valueOf: (e: T) => number | undefined = () => undefined): T[] {
  const byValue = (a: T, b: T) => (valueOf(b) ?? -1) - (valueOf(a) ?? -1);
  const compare: Record<CardSort, (a: T, b: T) => number> = {
    value: (a, b) => byValue(a, b) || recent(a, b),
    recent: (a, b) => recent(a, b),
    dex: (a, b) => (dexNumber(a) ?? Infinity) - (dexNumber(b) ?? Infinity) || byName(a, b) || printing(a, b),
    name: (a, b) => byName(a, b) || printing(a, b),
    rarity: (a, b) => rarityTier(b.card.rarity) - rarityTier(a.card.rarity) || byValue(a, b) || byName(a, b),
    set: () => 0,
  };
  return [...entries].sort((a, b) => compare[sort](a, b) || printing(a, b));
}
