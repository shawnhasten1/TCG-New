// Collection by Pokémon: the Pokémon you've pulled, plus search to jump to any Pokémon.

import { useEffect, useMemo, useState } from "react";
import { cardImage } from "../api/tcgdex";
import { href } from "../app/router";
import { ownedSpecies, searchPokemon, type SpeciesEntry } from "./pokedex";
import { ownership } from "./progress";
import { getPulls, onCollectionChange, type PullRecord } from "./store";
import { useOpenedSets } from "./useOpenedSets";
import { formatTotals, PriceToggle, pullsValue, useCardPrices } from "./usePrices";
import { CollectionViewSwitch } from "./ViewSwitch";
import "./collection.css";

type Sort = "dex" | "copies" | "recent";
const pad = (n: number) => String(n).padStart(4, "0");

export function PokedexPage() {
  const [pulls, setPulls] = useState<PullRecord[]>();
  const [sort, setSort] = useState<Sort>("dex");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let live = true;
    const reload = () => getPulls().then((p) => live && setPulls(p));
    void reload();
    const off = onCollectionChange(reload);
    return () => {
      live = false;
      off();
    };
  }, []);

  const { sets, progress } = useOpenedSets(pulls);
  const cards = useMemo(() => sets?.flatMap((d) => d.cards), [sets]);

  const owned = useMemo(() => ownership(pulls ?? []), [pulls]);
  const species = useMemo(() => {
    const list = cards ? ownedSpecies(cards, owned) : [];
    const by: Record<Sort, (a: SpeciesEntry, b: SpeciesEntry) => number> = {
      dex: (a, b) => a.dexId - b.dexId,
      copies: (a, b) => b.printings - a.printings || b.copies - a.copies || a.dexId - b.dexId,
      recent: (a, b) => b.lastPulledAt.localeCompare(a.lastPulledAt),
    };
    return list.sort(by[sort]);
  }, [cards, owned, sort]);
  // Prices for owned Pokémon cards only; trainers and energy aren't shown here.
  const dexOf = useMemo(() => new Map((cards ?? []).filter((c) => c.category === "Pokemon" && c.dexId?.length).map((c) => [c.id, c.dexId!])), [cards]);
  const pokemonPulls = useMemo(() => (pulls ?? []).filter((p) => dexOf.has(p.cardId)), [pulls, dexOf]);
  const pricedIds = useMemo(() => pokemonPulls.map((p) => p.cardId), [pokemonPulls]);
  const { showPrices, prices, loading } = useCardPrices(pricedIds);
  const values = useMemo(() => {
    if (!showPrices) return undefined;
    const byDex = new Map<number, PullRecord[]>();
    for (const p of pokemonPulls) for (const d of dexOf.get(p.cardId)!) (byDex.get(d) ?? byDex.set(d, []).get(d)!).push(p);
    return { all: pullsValue(pokemonPulls, prices), byDex: new Map([...byDex].map(([d, ps]) => [d, pullsValue(ps, prices)])) };
  }, [showPrices, pokemonPulls, dexOf, prices]);

  const ownedDex = new Set(species.map((s) => s.dexId));
  const results = searchPokemon(query);

  return (
    <main className="collection pokedex">
      <nav className="crumbs">
        <a href={href.open()}>← Open packs</a>
      </nav>
      <h1>Your Pokémon</h1>
      <CollectionViewSwitch current="pokemon" />

      <div className="dex-search">
        <input type="search" placeholder="Find any Pokémon by name or number" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Find a Pokémon" />
        {query && (
          <ul className="dex-results">
            {results.length === 0 && <li className="muted">No Pokémon match “{query}”.</li>}
            {results.map((r) => (
              <li key={r.dexId}>
                <a href={href.pokemon(r.dexId)}>
                  <span className="dex-no">#{pad(r.dexId)}</span> {r.name}
                  {ownedDex.has(r.dexId) && <span className="chip">owned</span>}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!pulls || !cards ? (
        <p className="muted" role="status">
          {progress[1] ? `Loading your sets… ${progress[0]} of ${progress[1]}` : "Loading…"}
        </p>
      ) : species.length === 0 ? (
        <p className="muted empty">
          No Pokémon yet. <a href={href.open()}>Open a pack</a>, or search above to browse any Pokémon's cards.
        </p>
      ) : (
        <>
          <div className="toolbar">
            <p className="muted">
              {species.length} Pokémon · {species.reduce((n, s) => n + s.printings, 0)} different cards
              {values && ` · worth ${formatTotals(values.all)}${loading ? " (loading…)" : ""}`}
            </p>
            <PriceToggle />
            <label>
              Sort{" "}
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="dex">Pokédex number</option>
                <option value="copies">Most cards</option>
                <option value="recent">Recently pulled</option>
              </select>
            </label>
          </div>
          <ol className="dex-grid">
            {species.map((s) => (
              <li key={s.dexId}>
                <a href={href.pokemon(s.dexId)} aria-label={`${s.name}, ${s.printings} different cards`}>
                  <img src={cardImage(s.best, "low")} alt="" loading="lazy" />
                  <span className="dex-no">#{pad(s.dexId)}</span>
                  <strong>{s.name}</strong>
                  <span className="muted">
                    {s.printings} {s.printings === 1 ? "card" : "cards"}
                    {s.copies > s.printings ? ` · ${s.copies} copies` : ""}
                  </span>
                  {values && <span className="price">{formatTotals(values.byDex.get(s.dexId)!)}</span>}
                </a>
              </li>
            ))}
          </ol>
        </>
      )}
    </main>
  );
}
