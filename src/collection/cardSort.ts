// Every owned card in one list, for the "All cards" collection view: sorted by value, recency, Pokédex number or name.

import type { OwnedCard } from "./cardGroups";

export type CardSort = "value" | "recent" | "dex" | "name";

export const CARD_SORT_LABEL: Record<CardSort, string> = { value: "Value", recent: "Recently pulled", dex: "Pokédex number", name: "Name" };

/** Lowest National Pokédex number on the card; undefined for Trainers, Energy and cards TCGdex has no number for. */
export const dexNumber = (e: OwnedCard) => (e.card.dexId?.length ? Math.min(...e.card.dexId) : undefined);

const recent = (a: OwnedCard, b: OwnedCard) => b.owned.lastPulledAt.localeCompare(a.owned.lastPulledAt);
const byName = (a: OwnedCard, b: OwnedCard) => a.card.name.localeCompare(b.card.name, undefined, { sensitivity: "base", numeric: true });
/** Newest set first, then card number: a stable last resort. */
const printing = (a: OwnedCard, b: OwnedCard) =>
  (b.set.releaseDate ?? "").localeCompare(a.set.releaseDate ?? "") || a.card.localId.localeCompare(b.card.localId, undefined, { numeric: true });

/**
 * Sorted copy of `entries`. Value is highest first (cards with no price last), recent is newest first,
 * Pokédex number is lowest first with non-Pokémon after (by name), and name is A to Z.
 */
export function sortCards(entries: OwnedCard[], sort: CardSort, valueOf: (e: OwnedCard) => number | undefined = () => undefined): OwnedCard[] {
  const compare: Record<CardSort, (a: OwnedCard, b: OwnedCard) => number> = {
    value: (a, b) => (valueOf(b) ?? -1) - (valueOf(a) ?? -1) || recent(a, b),
    recent: (a, b) => recent(a, b),
    dex: (a, b) => (dexNumber(a) ?? Infinity) - (dexNumber(b) ?? Infinity) || byName(a, b) || printing(a, b),
    name: (a, b) => byName(a, b) || printing(a, b),
  };
  return [...entries].sort((a, b) => compare[sort](a, b) || printing(a, b));
}
