// Which Pokémon you've caught, for marking a pulled card as a new Pokédex entry. Reads the card data of every set
// you've pulled from, which is already cached from opening packs.

import { client } from "../app/client";
import { speciesOf } from "./pokedex";
import type { PullRecord } from "./store";

/** National Pokédex numbers of every Pokémon among `pulls`. Rejects if any set's cards can't be read, since a gap would make old Pokémon look new. */
export async function caughtDex(pulls: PullRecord[]): Promise<Set<number>> {
  const bySet = new Map<string, Set<string>>();
  for (const p of pulls) (bySet.get(p.setId) ?? bySet.set(p.setId, new Set()).get(p.setId)!).add(p.cardId);
  const caught = new Set<number>();
  await Promise.all(
    [...bySet].map(async ([setId, ids]) => {
      const data = await client.getSetCards(setId);
      for (const c of data.cards) if (ids.has(c.id)) for (const d of speciesOf(c)) caught.add(d);
    }),
  );
  return caught;
}
