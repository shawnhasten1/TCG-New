// A set's binder: every card in number order, missing ones faded, with copies and completion.

import { useEffect, useMemo, useState } from "react";
import type { CardPricing } from "../api/tcgdex";
import { cardImage } from "../api/tcgdex";
import type { Card, SetData } from "../api/types";
import { client } from "../app/client";
import { href } from "../app/router";
import { pullableCardIds } from "../engine/openPack";
import { profileFor } from "../engine/profiles";
import { layoutFor } from "../foil/layouts";
import { CardDetail } from "./CardDetail";
import { formatPrice, priceFor } from "./prices";
import { isMainSet, ownership, setProgress } from "./progress";
import { clearPulls, getPulls, onCollectionChange, type PullRecord } from "./store";
import "./collection.css";

type Filter = "all" | "owned" | "missing" | "duplicates";

/** Fetches prices a few at a time; TCGdex rate-limits bursts. */
async function loadPrices(ids: string[], onPrice: (id: string, p: CardPricing | null) => void, signal: { live: boolean }) {
  let next = 0;
  const worker = async () => {
    while (next < ids.length && signal.live) {
      const id = ids[next++];
      onPrice(id, await client.getCardPricing(id).catch(() => null));
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}

export function BinderPage({ setId }: { setId: string }) {
  const [data, setData] = useState<SetData>();
  const [pulls, setPulls] = useState<PullRecord[]>();
  const [error, setError] = useState<string>();
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Card>();
  const [showPrices, setShowPrices] = useState(false);
  const [prices, setPrices] = useState<Map<string, CardPricing | null>>(new Map());

  useEffect(() => {
    let live = true;
    client.getSetCards(setId).then((d) => live && setData(d), (e) => live && setError(String(e)));
    const reload = () => getPulls(setId).then((p) => live && setPulls(p));
    void reload();
    const off = onCollectionChange(reload);
    return () => {
      live = false;
      off();
    };
  }, [setId]);

  const owned = useMemo(() => ownership(pulls ?? []), [pulls]);
  const profile = data && profileFor(data.set);
  const pullable = useMemo(() => (data ? (profile ? pullableCardIds(data, profile) : new Set(data.cards.map((c) => c.id))) : new Set<string>()), [data, profile]);
  const official = data?.set.cardCount.official ?? 0;
  const progress = data && pulls ? setProgress(data.cards, official, pulls, pullable) : undefined;

  // Prices for owned cards, on request.
  const ownedIds = useMemo(() => [...owned.keys()].sort(), [owned]);
  useEffect(() => {
    if (!showPrices) return;
    const signal = { live: true };
    const todo = ownedIds.filter((id) => !prices.has(id));
    void loadPrices(todo, (id, p) => signal.live && setPrices((m) => new Map(m).set(id, p)), signal);
    return () => void (signal.live = false);
    // `prices` is left out of the deps on purpose: it only skips what's already fetched.
  }, [showPrices, ownedIds]);

  const value = useMemo(() => {
    if (!showPrices || !pulls) return undefined;
    const totals = { USD: 0, EUR: 0 };
    let priced = 0;
    for (const p of pulls) {
      const price = priceFor(prices.get(p.cardId), p.finish, p.firstEdition);
      if (price) (totals[price.currency] += price.amount), priced++;
    }
    return { totals, priced, loading: ownedIds.some((id) => !prices.has(id)) };
  }, [showPrices, pulls, prices, ownedIds]);

  if (error) return <main className="collection"><p className="error">Couldn't load this set. {error}</p></main>;
  if (!data || !pulls || !progress) return <main className="collection"><p className="muted" role="status">Loading binder…</p></main>;

  const visible = data.cards.filter((c) => {
    const o = owned.get(c.id);
    if (filter === "owned") return !!o;
    if (filter === "missing") return !o && pullable.has(c.id);
    if (filter === "duplicates") return (o?.total ?? 0) > 1;
    return true;
  });
  const layout = layoutFor(data.set.serie.id);

  const reset = async () => {
    if (confirm(`Remove all ${progress.pulls} pulled cards from ${data.set.name}? This can't be undone.`)) await clearPulls(setId);
  };

  return (
    <main className="collection binder">
      <nav className="crumbs">
        <a href={href.collection()}>← Collection</a>
        <a href={href.picker()}>All sets</a>
        <a href={href.pokedex()}>By Pokémon</a>
      </nav>

      <header className="binder-head">
        {data.set.logo && <img className="set-logo" src={`${data.set.logo}.webp`} alt="" />}
        <div>
          <h1>{data.set.name}</h1>
          <p className="muted">
            {data.set.serie.name}
            {data.set.releaseDate ? ` · ${data.set.releaseDate.slice(0, 4)}` : ""}
          </p>
          <div className="progress-line">
            <div className="bar" role="progressbar" aria-valuenow={Math.round(progress.percent)} aria-valuemin={0} aria-valuemax={100} aria-label="Main set completion">
              <div style={{ width: `${progress.percent}%` }} />
            </div>
            <strong>{Math.floor(progress.percent)}%</strong>
          </div>
          <dl className="stats">
            <div>
              <dt>Main set</dt>
              <dd>
                {progress.mainOwned} / {progress.mainTotal}
              </dd>
            </div>
            <div>
              <dt>With secrets</dt>
              <dd>
                {progress.allOwned} / {progress.allTotal}
              </dd>
            </div>
            <div>
              <dt>Packs</dt>
              <dd>{progress.packs}</dd>
            </div>
            <div>
              <dt>Cards pulled</dt>
              <dd>{progress.pulls}</dd>
            </div>
            <div>
              <dt>Duplicates</dt>
              <dd>{progress.duplicates}</dd>
            </div>
            {value && (
              <div>
                <dt>Value{value.loading ? " (loading…)" : ""}</dt>
                <dd>
                  {[value.totals.USD && formatPrice({ amount: value.totals.USD, currency: "USD" }), value.totals.EUR && formatPrice({ amount: value.totals.EUR, currency: "EUR" })].filter(Boolean).join(" + ") || "—"}
                </dd>
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
          {(["all", "owned", "missing", "duplicates"] as Filter[]).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <label>
          <input type="checkbox" checked={showPrices} onChange={(e) => setShowPrices(e.target.checked)} /> Show market prices
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="muted empty">{filter === "all" ? "This set has no cards." : `No ${filter} cards.`}</p>
      ) : (
        <ol className="binder-grid">
          {visible.map((c) => {
            const o = owned.get(c.id);
            const state = o ? "owned" : pullable.has(c.id) ? "missing" : "unpullable";
            const price = showPrices && o ? priceFor(prices.get(c.id), o.byFinish.holo ? "holo" : o.byFinish.reverse ? "reverse" : "normal", o.firstEdition > 0) : undefined;
            const extra = !isMainSet(c.localId, official);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className="binder-slot"
                  data-state={state}
                  onClick={() => setSelected(c)}
                  aria-label={`${c.name}, #${c.localId}, ${state === "owned" ? `owned ×${o!.total}` : state === "missing" ? "missing" : "not in packs"}`}
                >
                  <img src={cardImage(c, "low")} alt="" loading="lazy" />
                  {o && o.total > 1 && <span className="count">×{o.total}</span>}
                  {o && (
                    <span className="finishes">
                      {o.byFinish.holo > 0 && <span data-f="holo">Holo</span>}
                      {o.byFinish.reverse > 0 && <span data-f="reverse">Rev</span>}
                      {o.firstEdition > 0 && <span data-f="first">1st</span>}
                    </span>
                  )}
                  {state === "unpullable" && <span className="note">Not in packs</span>}
                </button>
                <span className="caption">
                  #{c.localId}
                  {extra ? " ✦" : ""}
                  {price && <span className="price">{formatPrice(price)}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <footer>
        <p className="muted">Faded cards are still missing. “Not in packs” cards (basic energy, cards without scans) don't count toward completion. ✦ marks secret and subset cards.</p>
        {progress.pulls > 0 && (
          <button type="button" className="danger" onClick={reset}>
            Reset this set
          </button>
        )}
      </footer>

      {selected && <CardDetail card={selected} official={official} owned={owned.get(selected.id)} layout={layout} onClose={() => setSelected(undefined)} />}
    </main>
  );
}
