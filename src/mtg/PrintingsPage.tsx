// Every printing of a Magic card among the sets packs come from (#/card/<oracleId>), Magic's version of a Pokémon's
// page: each printing's art and rarity, and which finishes you own. The printings come from one Scryfall search, by the
// card's oracle id (worker/mtg.ts), so this stays quick however many sets there are.

import { useEffect, useMemo, useState } from "react";
import { cardImage } from "../api/tcgdex";
import type { CardWithSet } from "../api/types";
import { RetryImg } from "../app/RetryImg";
import { href } from "../app/router";
import { Spinner } from "../app/Spinner";
import { CardDetail } from "../collection/CardDetail";
import { formatPrice } from "../collection/prices";
import { ownership } from "../collection/progress";
import { getPulls, onCollectionChange, type PullRecord } from "../collection/store";
import { formatTotals, ownedPrice, PriceToggle, pullsValue, useCardPrices } from "../collection/usePrices";
import { CollectionViewSwitch } from "../collection/ViewSwitch";
import { layoutFor } from "../foil/layouts";
import { mtgCards } from "./client";
import { boosterEra, foilEra, MTG_ERAS, mtgSet } from "./sets";
import "../collection/collection.css";

type Show = "all" | "owned" | "missing";
/** A Magic card is foil or not. */
const FINISHES = [
  { key: "holo", label: "Foil" },
  { key: "normal", label: "Non-foil" },
] as const;

export function PrintingsPage({ oracleId }: { oracleId: string }) {
  const [printings, setPrintings] = useState<CardWithSet[]>();
  const [pulls, setPulls] = useState<PullRecord[]>();
  const [error, setError] = useState<string>();
  const [show, setShow] = useState<Show>("all");
  const [selected, setSelected] = useState<CardWithSet>();
  /** Each set's main-set size, for the close-up's "#12 / 271". */
  const [official, setOfficial] = useState(new Map<string, number>());

  useEffect(() => {
    let live = true;
    mtgCards.getPrintings(oracleId).then(
      (p) => live && setPrintings(p),
      (e) => live && setError(e instanceof Error ? e.message : String(e)),
    );
    mtgCards.getSets().then(
      (sets) => live && setOfficial(new Map(sets.map((s) => [s.id, s.cardCount.official]))),
      () => undefined,
    );
    const reload = () => getPulls().then((p) => live && setPulls(p));
    void reload();
    const off = onCollectionChange(reload);
    return () => {
      live = false;
      off();
    };
  }, [oracleId]);

  const owned = useMemo(() => ownership(pulls ?? []), [pulls]);
  const name = printings?.[0]?.name ?? "This card";
  const finishesOf = (c: CardWithSet) => FINISHES.filter((f) => c.variants[f.key]).map((f) => ({ ...f, owned: owned.get(c.id)?.byFinish[f.key] ?? 0 }));
  const finishes = (printings ?? []).flatMap(finishesOf);
  const progress = {
    owned: (printings ?? []).filter((c) => owned.has(c.id)).length,
    total: printings?.length ?? 0,
    finishesOwned: finishes.filter((f) => f.owned).length,
    finishesTotal: finishes.length,
  };

  const ownedIds = useMemo(() => (printings ?? []).filter((c) => owned.has(c.id)).map((c) => c.id), [printings, owned]);
  const { showPrices, prices, loading } = useCardPrices(ownedIds);
  const value = useMemo(() => {
    if (!showPrices || !pulls) return undefined;
    const ids = new Set(ownedIds);
    return pullsValue(pulls.filter((p) => ids.has(p.cardId)), prices);
  }, [showPrices, pulls, ownedIds, prices]);

  const visible = (printings ?? []).filter((c) => (show === "owned" ? owned.has(c.id) : show === "missing" ? !owned.has(c.id) : true));
  const groups = MTG_ERAS.map((era) => ({ era, cards: visible.filter((c) => { const s = mtgSet(c.set.id); return s && boosterEra(s) === era.id; }) })).filter((g) => g.cards.length);

  return (
    <main className="collection pokemon-page">
      <nav className="crumbs">
        <a href={href.cardIndex()}>← Card index</a>
      </nav>
      <CollectionViewSwitch current="index" />

      <header className="pokemon-head">
        <h1>{name}</h1>
        {printings && (
          <>
            <div className="progress-line">
              <div className="bar" role="progressbar" aria-label={`${name} printings owned`} aria-valuenow={progress.owned} aria-valuemin={0} aria-valuemax={progress.total}>
                <div style={{ width: `${progress.total ? (progress.owned / progress.total) * 100 : 0}%` }} />
              </div>
            </div>
            <p>
              You own <strong>{progress.owned}</strong> of {progress.total} printings of {name} that packs can give you, and <strong>{progress.finishesOwned}</strong> of {progress.finishesTotal}{" "}
              printing-and-finish combinations.
              {value && ` Your copies are worth ${formatTotals(value)}${loading ? " (loading…)" : ""}.`}
            </p>
          </>
        )}
      </header>

      {error && <p className="error">Couldn't load its printings. {error}</p>}
      {!error && (!printings || !pulls) && (
        <p className="muted loading-line" role="status">
          <Spinner />
          Loading every printing…
        </p>
      )}

      {printings && pulls && (
        <>
          <div className="toolbar">
            <div role="group" aria-label="Show" className="segmented">
              {(["all", "owned", "missing"] as Show[]).map((s) => (
                <button key={s} type="button" aria-pressed={show === s} onClick={() => setShow(s)}>
                  {s[0].toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            <PriceToggle />
          </div>

          {groups.length === 0 && <p className="muted empty">{printings.length ? "No printings match." : "No set here has this card in its packs."}</p>}
          {groups.map((g) => (
            <section key={g.era.id}>
              <h2>
                {g.era.name} <span className="muted">· {g.cards.length} {g.cards.length === 1 ? "printing" : "printings"}</span>
              </h2>
              <ol className="binder-grid">
                {g.cards.map((c) => {
                  const o = owned.get(c.id);
                  const set = mtgSet(c.set.id);
                  const price = showPrices && o ? ownedPrice(prices.get(c.id), o) : undefined;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="binder-slot"
                        data-state={o ? "owned" : "missing"}
                        onClick={() => setSelected(c)}
                        aria-label={`${c.name}, ${set?.name ?? c.set.id} #${c.localId}, ${c.rarity}, ${o ? `owned ×${o.total}` : "missing"}`}
                      >
                        <RetryImg src={cardImage(c, "low")} alt="" loading="lazy" />
                        {o && o.total > 1 && <span className="count">×{o.total}</span>}
                      </button>
                      <span className="set-label">
                        <a href={href.binder(c.set.id)}>{set?.name ?? c.set.id}</a>
                        {set && <span className="muted"> · {set.released.slice(0, 4)}</span>}
                      </span>
                      <span className="caption">
                        #{c.localId} · {c.rarity}
                        {price && <span className="price"> · {formatPrice(price)}</span>}
                      </span>
                      <ul className="finish-chips" aria-label="Finishes">
                        {finishesOf(c).map((f) => (
                          <li key={f.key} data-f={f.key} data-owned={f.owned > 0}>
                            {f.label}
                            {f.owned > 0 ? ` ×${f.owned}` : ""}
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
          <p className="muted footnote">Faded printings and finishes are ones you don't own yet. Only printings that come in the packs of the sets here are shown.</p>
        </>
      )}

      {selected && (
        <CardDetail
          card={selected}
          official={official.get(selected.set.id) ?? 0}
          owned={owned.get(selected.id)}
          layout={layoutFor(`mtg-${foilEra(mtgSet(selected.set.id)!)}`)}
          onClose={() => setSelected(undefined)}
        />
      )}
    </main>
  );
}
