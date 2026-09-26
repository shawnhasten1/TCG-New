// One Pokémon across every set: each printing (art and rarity), and which finishes you own.

import { useEffect, useMemo, useState } from "react";
import { cardImage } from "../api/tcgdex";
import type { CardWithSet, SetSummary } from "../api/types";
import { client, getUnopenable } from "../app/client";
import { href } from "../app/router";
import { ERAS } from "../engine/randomSet";
import { layoutFor } from "../foil/layouts";
import { CardDetail } from "./CardDetail";
import { buildPrintings, FINISH_LABEL, groupByEra, pokemonName, pokemonProgress, type FinishKey, type Printing } from "./pokedex";
import { ownership } from "./progress";
import { formatPrice } from "./prices";
import { getPulls, onCollectionChange, type PullRecord } from "./store";
import { formatTotals, ownedPrice, PriceToggle, pullsValue, useCardPrices } from "./usePrices";
import { CollectionViewSwitch } from "./ViewSwitch";
import "./collection.css";
import { RetryImg } from "../app/RetryImg";
import { Spinner } from "../app/Spinner";

type Show = "all" | "owned" | "missing";
const pad = (n: number) => String(n).padStart(4, "0");

export function PokemonPage({ dexId }: { dexId: number }) {
  const [cards, setCards] = useState<CardWithSet[]>();
  const [sets, setSets] = useState<Map<string, SetSummary>>();
  const [unopenable, setUnopenable] = useState<Record<string, string>>({});
  const [pulls, setPulls] = useState<PullRecord[]>();
  const [error, setError] = useState<string>();
  const [show, setShow] = useState<Show>("all");
  const [finish, setFinish] = useState<FinishKey | "any">("any");
  const [era, setEra] = useState("all");
  const [includeOther, setIncludeOther] = useState(false);
  const [selected, setSelected] = useState<Printing>();

  useEffect(() => {
    let live = true;
    Promise.all([client.getPokemonCards(dexId), client.listSetSummaries(), getUnopenable()]).then(
      ([c, s, u]) => {
        if (!live) return;
        setCards(c);
        setSets(new Map(s.map((x) => [x.id, x])));
        setUnopenable(u);
      },
      (e) => live && setError(String(e)),
    );
    const reload = () => getPulls().then((p) => live && setPulls(p));
    void reload();
    const off = onCollectionChange(reload);
    return () => {
      live = false;
      off();
    };
  }, [dexId]);

  const owned = useMemo(() => ownership(pulls ?? []), [pulls]);
  const printings = useMemo(() => (cards && sets ? buildPrintings(cards, { sets, unopenable, owned }) : []), [cards, sets, unopenable, owned]);
  const progress = pokemonProgress(printings);
  const ownedIds = useMemo(() => printings.filter((p) => p.owned).map((p) => p.card.id), [printings]);
  const { showPrices, prices, loading } = useCardPrices(ownedIds);
  const value = useMemo(() => {
    if (!showPrices || !pulls) return undefined;
    const ids = new Set(ownedIds);
    return pullsValue(pulls.filter((p) => ids.has(p.cardId)), prices);
  }, [showPrices, pulls, ownedIds, prices]);
  const priceTag = (id: string) => {
    const o = showPrices ? owned.get(id) : undefined;
    const price = o && ownedPrice(prices.get(id), o);
    return price && <span className="price"> · {formatPrice(price)}</span>;
  };
  const name = pokemonName(dexId, cards?.[0]?.name);

  const visible = printings.filter((p) => {
    if (!includeOther && !p.pullable && p.owned === 0) return false;
    if (show === "owned" && !p.owned) return false;
    if (show === "missing" && (p.owned || !p.pullable)) return false;
    if (finish !== "any" && !p.finishes.some((f) => f.key === finish && (show !== "owned" || f.owned > 0))) return false;
    if (era !== "all" && p.era !== era) return false;
    return true;
  });
  const groups = groupByEra(visible);
  const otherCount = printings.filter((p) => !p.pullable).length;

  return (
    <main className="collection pokemon-page">
      <nav className="crumbs">
        <a href={href.pokedex()}>← Pokédex</a>
        <span className="dex-nav">
          {dexId > 1 && <a href={href.pokemon(dexId - 1)}>‹ #{pad(dexId - 1)}</a>}
          <a href={href.pokemon(dexId + 1)}>#{pad(dexId + 1)} ›</a>
        </span>
      </nav>
      <CollectionViewSwitch current="pokemon" />

      <header className="pokemon-head">
        <span className="dex-no">#{pad(dexId)}</span>
        <h1>{name}</h1>
        {cards && sets && (
          <>
            <div className="progress-line">
              <div className="bar" role="progressbar" aria-label={`${name} cards owned`} aria-valuenow={progress.printingsOwned} aria-valuemin={0} aria-valuemax={progress.printingsTotal}>
                <div style={{ width: `${progress.printingsTotal ? (progress.printingsOwned / progress.printingsTotal) * 100 : 0}%` }} />
              </div>
            </div>
            <p>
              You own <strong>{progress.printingsOwned}</strong> of {progress.printingsTotal} {name} cards that packs can give you, and{" "}
              <strong>{progress.finishesOwned}</strong> of {progress.finishesTotal} card-and-finish combinations.
              {value && ` Your ${name} cards are worth ${formatTotals(value)}${loading ? " (loading…)" : ""}.`}
            </p>
          </>
        )}
      </header>

      {error && <p className="error">Couldn't load {name}'s cards. {error}</p>}
      {!error && (!cards || !sets || !pulls) && (
        <p className="muted loading-line" role="status">
          <Spinner />
          Loading every {name} card…
        </p>
      )}

      {cards && sets && pulls && (
        <>
          <div className="toolbar">
            <div role="group" aria-label="Show" className="segmented">
              {(["all", "owned", "missing"] as Show[]).map((s) => (
                <button key={s} type="button" aria-pressed={show === s} onClick={() => setShow(s)}>
                  {s[0].toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            <label>
              Finish{" "}
              <select value={finish} onChange={(e) => setFinish(e.target.value as FinishKey | "any")}>
                <option value="any">Any</option>
                {(Object.keys(FINISH_LABEL) as FinishKey[]).map((k) => (
                  <option key={k} value={k}>
                    {FINISH_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Era{" "}
              <select value={era} onChange={(e) => setEra(e.target.value)}>
                <option value="all">All eras</option>
                {ERAS.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
                {includeOther && <option value="other">Promos & other products</option>}
              </select>
            </label>
            {otherCount > 0 && (
              <label>
                <input type="checkbox" checked={includeOther} onChange={(e) => setIncludeOther(e.target.checked)} /> Include {otherCount} promos and other cards packs never give
              </label>
            )}
            <PriceToggle />
          </div>

          {groups.length === 0 && <p className="muted empty">No {name} cards match these filters.</p>}
          {groups.map((g) => (
            <section key={g.era}>
              <h2>
                {g.name} <span className="muted">· {g.sets.reduce((n, s) => n + s.printings.length, 0)} cards</span>
              </h2>
              {/* One grid per era (most sets have only a card or two of a Pokémon), labelled per tile. */}
              <ol className="binder-grid">
                {g.sets.flatMap((s) =>
                  s.printings.map((p) => (
                      <li key={p.card.id}>
                        <button
                          type="button"
                          className="binder-slot"
                          data-state={p.owned ? "owned" : p.pullable ? "missing" : "unpullable"}
                          onClick={() => setSelected(p)}
                          aria-label={`${p.card.name}, ${s.set?.name ?? s.setId} #${p.card.localId}, ${p.card.rarity}, ${p.owned ? `owned ×${p.owned}` : p.pullable ? "missing" : p.reason}`}
                        >
                          {p.card.image ? <RetryImg src={cardImage(p.card, "low")} alt="" loading="lazy" /> : <span className="no-scan">No scan</span>}
                          {p.owned > 1 && <span className="count">×{p.owned}</span>}
                          {!p.pullable && p.owned === 0 && <span className="note">{p.reason}</span>}
                        </button>
                        <span className="set-label">
                          {s.set?.name ?? s.setId}
                          {s.set && <span className="muted"> · {s.set.releaseDate.slice(0, 4)}</span>}
                        </span>
                        <span className="caption">
                          #{p.card.localId} · {p.card.rarity}
                          {priceTag(p.card.id)}
                        </span>
                        <ul className="finish-chips" aria-label="Finishes">
                          {p.finishes.map((f) => (
                            <li key={f.key} data-f={f.key} data-owned={f.owned > 0} title={f.obtainable ? undefined : "Doesn't count toward completion"}>
                              {FINISH_LABEL[f.key]}
                              {f.owned > 0 ? ` ×${f.owned}` : ""}
                            </li>
                          ))}
                        </ul>
                      </li>
                  )),
                )}
              </ol>
            </section>
          ))}
          <p className="muted footnote">
            Faded cards and finishes are ones you don't own yet. Finishes come from TCGdex's printing data; for Black & White, XY and Sun & Moon, which have none, they follow the pack rules.
          </p>
        </>
      )}

      {selected && selected.card.image && (
        <CardDetail
          card={selected.card}
          official={selected.set?.cardCount.official ?? 0}
          owned={owned.get(selected.card.id)}
          layout={layoutFor(selected.set?.serie.id ?? "sv")}
          onClose={() => setSelected(undefined)}
        />
      )}
    </main>
  );
}
