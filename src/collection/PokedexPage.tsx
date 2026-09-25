// The Pokédex: every Pokémon by region, filled in with your best card of each one you've pulled.

import { useEffect, useMemo, useState } from "react";
import { cardImage } from "../api/tcgdex";
import { href } from "../app/router";
import { fullDex, ownedSpecies, searchPokemon, type DexEntry } from "./pokedex";
import { ownership } from "./progress";
import { getPulls, onCollectionChange, type PullRecord } from "./store";
import { useOpenedSets } from "./useOpenedSets";
import { formatTotals, PriceToggle, pullsValue, useCardPrices } from "./usePrices";
import { CollectionViewSwitch } from "./ViewSwitch";
import "./collection.css";
import { RetryImg } from "../app/RetryImg";

type Show = "all" | "caught" | "missing";
type Sort = "dex" | "copies" | "recent";
const pad = (n: number) => String(n).padStart(4, "0");

/** Within a region: caught Pokémon ordered by the chosen sort, then the missing ones by number. */
const ORDER: Record<Sort, (a: DexEntry, b: DexEntry) => number> = {
  dex: (a, b) => a.dexId - b.dexId,
  copies: (a, b) =>
    Number(!a.caught) - Number(!b.caught) ||
    (b.caught?.printings ?? 0) - (a.caught?.printings ?? 0) ||
    (b.caught?.copies ?? 0) - (a.caught?.copies ?? 0) ||
    a.dexId - b.dexId,
  recent: (a, b) => Number(!a.caught) - Number(!b.caught) || (b.caught?.lastPulledAt ?? "").localeCompare(a.caught?.lastPulledAt ?? "") || a.dexId - b.dexId,
};

export function PokedexPage() {
  const [pulls, setPulls] = useState<PullRecord[]>();
  const [show, setShow] = useState<Show>("all");
  const [region, setRegion] = useState("all");
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
  const species = useMemo(() => (cards ? ownedSpecies(cards, owned) : []), [cards, owned]);
  const dex = useMemo(() => fullDex(species), [species]);
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
  const total = dex.reduce((n, r) => n + r.entries.length, 0);
  const sections = dex
    .filter((r) => region === "all" || r.region.id === region)
    .map((r) => ({ ...r, visible: r.entries.filter((e) => (show === "caught" ? e.caught : show === "missing" ? !e.caught : true)).sort(ORDER[sort]) }))
    .filter((r) => r.visible.length);

  return (
    <main className="collection pokedex">
      <h1>Pokédex</h1>
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
                  {ownedDex.has(r.dexId) && <span className="chip">caught</span>}
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
      ) : (
        <>
          <div className="dex-summary">
            <p>
              You've caught <strong>{species.length}</strong> of {total} Pokémon
              {species.length > 0 && ` · ${species.reduce((n, s) => n + s.printings, 0)} different cards`}
              {values && ` · worth ${formatTotals(values.all)}${loading ? " (loading…)" : ""}`}
            </p>
            <div className="bar" role="progressbar" aria-label="Pokémon caught" aria-valuenow={species.length} aria-valuemin={0} aria-valuemax={total}>
              <div style={{ width: `${(species.length / total) * 100}%` }} />
            </div>
            {species.length === 0 && (
              <p className="muted">
                <a href={href.open()}>Open a pack</a> to catch your first Pokémon. Any Pokémon card you pull fills in its entry.
              </p>
            )}
          </div>

          <div className="toolbar">
            <div role="group" aria-label="Show" className="segmented">
              {(["all", "caught", "missing"] as Show[]).map((s) => (
                <button key={s} type="button" aria-pressed={show === s} onClick={() => setShow(s)}>
                  {s[0].toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            <label>
              Region{" "}
              <select value={region} onChange={(e) => setRegion(e.target.value)}>
                <option value="all">All regions</option>
                {dex.map((r) => (
                  <option key={r.region.id} value={r.region.id}>
                    {r.region.name} ({r.caught}/{r.entries.length})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sort{" "}
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="dex">Pokédex number</option>
                <option value="copies">Most cards</option>
                <option value="recent">Recently pulled</option>
              </select>
            </label>
            <PriceToggle />
          </div>

          {sections.length === 0 && <p className="muted empty">{show === "caught" ? "No Pokémon caught here yet." : "You've caught every Pokémon here!"}</p>}
          {sections.map((r) => (
            <section key={r.region.id} className="dex-region" aria-labelledby={`region-${r.region.id}`}>
              <header>
                <h2 id={`region-${r.region.id}`}>
                  {r.region.name}{" "}
                  <span className="muted">
                    · {r.caught} / {r.entries.length}
                  </span>
                </h2>
                <div className="bar" role="progressbar" aria-label={`${r.region.name} Pokémon caught`} aria-valuenow={r.caught} aria-valuemin={0} aria-valuemax={r.entries.length}>
                  <div style={{ width: `${(r.caught / r.entries.length) * 100}%` }} />
                </div>
              </header>
              <ol className="dex-grid">
                {r.visible.map(({ dexId, name, caught: s }) => (
                  <li key={dexId}>
                    {s ? (
                      <a href={href.pokemon(dexId)} aria-label={`#${dexId} ${name}, ${s.printings} different cards`}>
                        <RetryImg src={cardImage(s.best, "low")} alt="" loading="lazy" />
                        <span className="dex-no">#{pad(dexId)}</span>
                        <strong>{name}</strong>
                        <span className="muted">
                          {s.printings} {s.printings === 1 ? "card" : "cards"}
                          {s.copies > s.printings ? ` · ${s.copies} copies` : ""}
                        </span>
                        {values && <span className="price">{formatTotals(values.byDex.get(dexId)!)}</span>}
                      </a>
                    ) : (
                      <a href={href.pokemon(dexId)} className="uncaught" aria-label={`#${dexId} ${name}, not caught yet`}>
                        <span className="slot" aria-hidden="true">
                          {dexId}
                        </span>
                        <span className="dex-no">#{pad(dexId)}</span>
                        <strong>{name}</strong>
                      </a>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </>
      )}
    </main>
  );
}
