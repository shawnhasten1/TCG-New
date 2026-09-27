// "New entry" on the reveal, in games whose collection has an index (gameCards.index): a card whose entry wasn't in
// the collection before the pack. Pokémon's entries are Pokédex numbers, so a new Pokémon is one; Magic's are cards by
// Scryfall's oracle id, so a card you've never had in any printing is one. Reads the card data of every set you've
// pulled from, which is already cached from opening packs.

import type { Card } from "../api/types";
import { gameCards } from "../app/gameCards";
import type { PullRecord } from "./store";

/** Every entry among `pulls`. Rejects if any set's cards can't be read, since a gap would make old entries look new. */
export async function ownedEntries(pulls: PullRecord[]): Promise<Set<string>> {
  const index = gameCards.index;
  if (!index) return new Set();
  const bySet = new Map<string, Set<string>>();
  for (const p of pulls) (bySet.get(p.setId) ?? bySet.set(p.setId, new Set()).get(p.setId)!).add(p.cardId);
  const owned = new Set<string>();
  await Promise.all(
    [...bySet].map(async ([setId, ids]) => {
      const data = await gameCards.getSetCards(setId);
      for (const c of data.cards) if (ids.has(c.id)) for (const k of index.keys(c)) owned.add(k);
    }),
  );
  return owned;
}

/** Cards with an entry not in `owned`. */
export function newEntryIds(cards: Card[], owned: Set<string>): Set<string> {
  const index = gameCards.index;
  return new Set(index ? cards.filter((c) => index.keys(c).some((k) => !owned.has(k))).map((c) => c.id) : []);
}

/** Adds cards' entries to `owned`, once their pack is saved. */
export function addEntries(owned: Set<string> | undefined, cards: Card[]): void {
  const index = gameCards.index;
  if (owned && index) for (const c of cards) for (const k of index.keys(c)) owned.add(k);
}
