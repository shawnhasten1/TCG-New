// A Magic set's binder: every card its boosters can hold, in collector number order (showcase and borderless
// printings after the main set). Cards you don't have are faded, as in Pokémon binders.

import { useEffect, useMemo, useState } from "react";
import { cardImage } from "../api/tcgdex";
import type { Card, SetData } from "../api/types";
import { RetryImg } from "../app/RetryImg";
import { href } from "../app/router";
import { CardDetail } from "../collection/CardDetail";
import { formatPrice } from "../collection/prices";
import { ownership } from "../collection/progress";
import { getPulls, onCollectionChange, type PullRecord } from "../collection/store";
import { formatTotals, ownedPrice, PriceToggle, pullsValue, useCardPrices } from "../collection/usePrices";
import { rarityKind } from "../engine/tiers";
import { layoutFor } from "../foil/layouts";
import { setSymbol } from "./cards";
import { getMtgSet } from "./client";
import { boosterEra, MTG_ERAS, mtgSet } from "./sets";
import "../collection/collection.css";
import "./mtg.css";

type Filter = "all" | "owned" | "missing";

export function MtgBinderPage({ setId }: { setId: string }) {
  const info = mtgSet(setId);
  const [data, setData] = useState<SetData>();
  const [pulls, setPulls] = useState<PullRecord[]>();
  const [error, setError] = useState<string>();
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Card>();

  useEffect(() => {
    let live = true;
    getMtgSet(setId).then(
      (d) => live && setData(d),
      (e) => live && setError(e instanceof Error ? e.message : String(e)),
    );
    const reload = () => getPulls(setId).then((p) => live && setPulls(p));
    void reload();
    const off = onCollectionChange(reload);
    return () => {
      live = false;
      off();
    };
  }, [setId]);

  const owned = useMemo(() => ownership(pulls ?? []), [pulls]);

  // Prices for owned cards, on request.
  const ownedIds = useMemo(() => [...owned.keys()], [owned]);
  const { showPrices, prices, loading } = useCardPrices(ownedIds);
  const value = useMemo(() => (showPrices && pulls ? pullsValue(pulls, prices) : undefined), [showPrices, pulls, prices]);

  if (!info) return <main className="collection"><p className="error">There's no Magic set {setId} here.</p></main>;
  if (error) return <main className="collection"><p className="error">Couldn't load this set. {error}</p></main>;
  if (!data || !pulls) return <main className="collection"><p className="muted" role="status">Loading binder…</p></main>;

  const have = data.cards.filter((c) => owned.has(c.id)).length;
  const percent = data.cards.length ? (have / data.cards.length) * 100 : 0;
  const visible = data.cards.filter((c) => (filter === "owned" ? owned.has(c.id) : filter === "missing" ? !owned.has(c.id) : true));
  const layout = layoutFor(data.set.serie.id);

  return (
    <main className="collection binder mtg-binder">
      <nav className="crumbs">
        <a href={href.collection()}>← Collection</a>
      </nav>

      <header className="binder-head">
        <img className="set-symbol" src={setSymbol(setId)} alt="" />
        <div>
          <h1>{data.set.name}</h1>
          <p className="muted">
            {setId.toUpperCase()} · {MTG_ERAS.find((e) => e.id === boosterEra(info))?.name} · {info.released.slice(0, 4)}
          </p>
          <div className="progress-line">
            <div className="bar" role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100} aria-label="Set completion">
              <div style={{ width: `${percent}%` }} />
            </div>
            <strong>{Math.floor(percent)}%</strong>
          </div>
          <dl className="stats">
            <div>
              <dt>Cards</dt>
              <dd>
                {have} / {data.cards.length}
              </dd>
            </div>
            <div>
              <dt>Cards pulled</dt>
              <dd>{pulls.length}</dd>
            </div>
            {value && (
              <div>
                <dt>Value{loading ? " (loading…)" : ""}</dt>
                <dd>{formatTotals(value)}</dd>
              </div>
            )}
          </dl>
        </div>
        <a className="button primary" href={href.open()}>
          Open a random pack
        </a>
      </header>

      <div className="toolbar">
        <div role="group" aria-label="Filter cards" className="segmented">
          {(["all", "owned", "missing"] as Filter[]).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <PriceToggle />
      </div>

      {visible.length === 0 ? (
        <p className="muted empty">No {filter} cards.</p>
      ) : (
        <ol className="binder-grid">
          {visible.map((c) => {
            const o = owned.get(c.id);
            const price = showPrices && o ? ownedPrice(prices.get(c.id), o) : undefined;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className="binder-slot"
                  data-state={o ? "owned" : "missing"}
                  onClick={() => setSelected(c)}
                  aria-label={`${c.name}, #${c.localId}, ${c.rarity}, ${o ? `owned ×${o.total}` : "missing"}`}
                >
                  <RetryImg src={cardImage(c, "low")} alt="" loading="lazy" />
                  {o && o.total > 1 && <span className="count">×{o.total}</span>}
                </button>
                <span className="caption">
                  #{c.localId}
                  <span className="rarity" data-kind={rarityKind(c.rarity)}>
                    {c.rarity}
                  </span>
                  {price && <span className="price">{formatPrice(price)}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {selected && <CardDetail card={selected} official={data.set.cardCount.official} owned={owned.get(selected.id)} layout={layout} onClose={() => setSelected(undefined)} />}
    </main>
  );
}
