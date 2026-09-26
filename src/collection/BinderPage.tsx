// A set's binder: every card in number order, missing ones faded, with copies and completion.

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { cardImage } from "../api/tcgdex";
import type { Card, SetData } from "../api/types";
import { client } from "../app/client";
import { href } from "../app/router";
import { pullableCardIds } from "../engine/openPack";
import { profileFor } from "../engine/profiles";
import { layoutFor } from "../foil/layouts";
import { CardDetail } from "./CardDetail";
import { isFiltering, matchesCard, NO_FILTER, type CardFilter } from "./cardFilter";
import { CardFilterBar } from "./CardFilterBar";
import { useFavorites } from "./favorites";
import { formatPrice } from "./prices";
import { isMainSet, ownership, setProgress } from "./progress";
import { useCollectionSource, whose } from "./source";
import { clearPulls, type PullRecord } from "./store";
import { formatTotals, ownedPrice, PriceToggle, pullsValue, useCardPrices } from "./usePrices";
import { ask } from "../app/Confirm";
import "./collection.css";
import { SetLogo } from "../app/SetLogo";
import { RetryImg } from "../app/RetryImg";
import { Spinner } from "../app/Spinner";

type Filter = "all" | "owned" | "missing" | "duplicates";

export function BinderPage({ setId }: { setId: string }) {
  const source = useCollectionSource();
  const [data, setData] = useState<SetData>();
  const [pulls, setPulls] = useState<PullRecord[]>();
  const [error, setError] = useState<string>();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState<CardFilter>(NO_FILTER);
  const [selected, setSelected] = useState<Card>();
  const favorites = useFavorites().ids;
  // The search box and buttons change at once; the card grid catches up with these deferred copies.
  const view = useDeferredValue(search);
  const viewFilter = useDeferredValue(filter);
  const pending = view !== search || viewFilter !== filter;

  useEffect(() => {
    let live = true;
    client.getSetCards(setId).then((d) => live && setData(d), (e) => live && setError(String(e)));
    const reload = () => source.getPulls(setId).then((p) => live && setPulls(p));
    void reload();
    const off = source.onChange(reload);
    return () => {
      live = false;
      off();
    };
  }, [setId, source]);

  const owned = useMemo(() => ownership(pulls ?? []), [pulls]);
  const profile = data && profileFor(data.set);
  const pullable = useMemo(() => (data ? (profile ? pullableCardIds(data, profile) : new Set(data.cards.map((c) => c.id))) : new Set<string>()), [data, profile]);
  const official = data?.set.cardCount.official ?? 0;
  const progress = data && pulls ? setProgress(data.cards, official, pulls, pullable) : undefined;

  // Prices for owned cards, on request.
  const ownedIds = useMemo(() => [...owned.keys()], [owned]);
  const { showPrices, prices, loading } = useCardPrices(ownedIds);
  const value = useMemo(() => (showPrices && pulls ? pullsValue(pulls, prices) : undefined), [showPrices, pulls, prices]);

  if (error) return <main className="collection"><p className="error">Couldn't load this set. {error}</p></main>;
  if (!data || !pulls || !progress) return <main className="collection"><p className="muted loading-line" role="status"><Spinner /> Loading binder…</p></main>;

  const visible = data.cards.filter((c) => {
    const o = owned.get(c.id);
    if (!matchesCard(c, view, { setName: data.set.name, owned: o, favorites })) return false;
    if (viewFilter === "owned") return !!o;
    if (viewFilter === "missing") return !o && pullable.has(c.id);
    if (viewFilter === "duplicates") return (o?.total ?? 0) > 1;
    return true;
  });
  const layout = layoutFor(data.set.serie.id);

  const reset = async () => {
    const ok = await ask({ title: `Clear ${data.set.name}?`, body: `This removes all ${progress.pulls} cards you've pulled from this set. It can't be undone.`, confirm: "Remove cards", danger: true });
    if (ok) await clearPulls(setId);
  };

  return (
    <main className="collection binder">
      <nav className="crumbs">
        {source.owner ? (
          <>
            <a href={source.links.collection()}>← {whose(source)} collection</a>
            <a href={href.friends()}>Friends</a>
          </>
        ) : (
          <>
            <a href={href.collection()}>← Collection</a>
            <a href={href.picker()}>All sets</a>
            <a href={href.pokedex()}>Pokédex</a>
          </>
        )}
      </nav>

      <header className="binder-head">
        <SetLogo logo={data.set.logo} className="set-logo" alt="" />
        <div>
          <h1>{data.set.name}</h1>
          {source.owner && <p className="owner-note">{whose(source)} binder</p>}
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
                <dt>Value{loading ? " (loading…)" : ""}</dt>
                <dd>{formatTotals(value)}</dd>
              </div>
            )}
          </dl>
        </div>
        {!source.owner && (
          <a className="button primary" href={href.open()}>
            Open a random pack
          </a>
        )}
      </header>

      <div className="toolbar">
        <div role="group" aria-label="Filter cards" className="segmented">
          {(["all", "owned", "missing", "duplicates"] as Filter[]).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <CardFilterBar cards={data.cards} filter={search} onChange={setSearch} placeholder="Search this set…">
        <PriceToggle />
      </CardFilterBar>

      {visible.length === 0 ? (
        <p className="muted empty">
          {isFiltering(view) ? "No cards match these filters." : viewFilter === "all" ? "This set has no cards." : `No ${viewFilter} cards.`}
        </p>
      ) : (
        <ol className="binder-grid" aria-busy={pending}>
          {visible.map((c) => {
            const o = owned.get(c.id);
            const state = o ? "owned" : pullable.has(c.id) ? "missing" : "unpullable";
            const price = showPrices && o ? ownedPrice(prices.get(c.id), o) : undefined;
            const extra = !isMainSet(c.localId, official);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className="binder-slot"
                  data-state={state}
                  onClick={() => setSelected(c)}
                  aria-label={`${c.name}, #${c.localId}, ${state === "owned" ? `owned ×${o!.total}` : state === "missing" ? "missing" : "not in packs"}${favorites.has(c.id) ? ", favorite" : ""}`}
                >
                  <RetryImg src={cardImage(c, "low")} alt="" loading="lazy" />
                  {o && o.total > 1 && <span className="count">×{o.total}</span>}
                  {favorites.has(c.id) && <span className="fav" aria-hidden="true">★</span>}
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
        {progress.pulls > 0 && !source.owner && (
          <button type="button" className="danger" onClick={reset}>
            Reset this set
          </button>
        )}
      </footer>

      {selected && <CardDetail card={selected} official={official} owned={owned.get(selected.id)} layout={layout} onClose={() => setSelected(undefined)} />}
    </main>
  );
}
