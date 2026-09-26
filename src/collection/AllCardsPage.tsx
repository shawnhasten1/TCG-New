// Every card you own (Pokémon, Trainers and Energy) in one list, sorted by value, recently pulled, Pokédex number or name.

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { cardImage } from "../api/tcgdex";
import { href } from "../app/router";
import { updateSettings } from "../app/settings";
import { layoutFor } from "../foil/layouts";
import { CardDetail } from "./CardDetail";
import { isFiltering, matchesCard, NO_FILTER, type CardFilter } from "./cardFilter";
import { CardFilterBar } from "./CardFilterBar";
import { useFavorites } from "./favorites";
import { pullHasFinish, type OwnedCard } from "./cardGroups";
import { CARD_SORT_LABEL, dexNumber, sortCards, type CardSort } from "./cardSort";
import { formatPrice } from "./prices";
import { ownership } from "./progress";
import { useCollectionSource, whose } from "./source";
import type { PullRecord } from "./store";
import { useOpenedSets } from "./useOpenedSets";
import { formatTotals, ownedPrice, PriceToggle, pullsValue, useCardPrices } from "./usePrices";
import { CollectionViewSwitch } from "./ViewSwitch";
import "./collection.css";
import { RetryImg } from "../app/RetryImg";
import { Spinner } from "../app/Spinner";
import { useIncremental } from "./useIncremental";

const SORTS: CardSort[] = ["value", "recent", "dex", "name"];
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const pad = (n: number) => String(n).padStart(4, "0");

export function AllCardsPage() {
  const source = useCollectionSource();
  const [pulls, setPulls] = useState<PullRecord[]>();
  const [sort, setSort] = useState<CardSort>("recent");
  const [selected, setSelected] = useState<OwnedCard>();
  const [filter, setFilter] = useState<CardFilter>(NO_FILTER);
  const favorites = useFavorites().ids;

  useEffect(() => {
    let live = true;
    const reload = () => source.getPulls().then((p) => live && setPulls(p));
    void reload();
    const off = source.onChange(reload);
    return () => {
      live = false;
      off();
    };
  }, [source]);

  const { sets, progress } = useOpenedSets(pulls);
  const owned = useMemo(() => ownership(pulls ?? []), [pulls]);
  const entries = useMemo(() => {
    const out: OwnedCard[] = [];
    for (const d of sets ?? []) for (const card of d.cards) if (owned.has(card.id)) out.push({ card, set: d.set, owned: owned.get(card.id)! });
    return out;
  }, [sets, owned]);

  const allCards = useMemo(() => entries.map((e) => e.card), [entries]);
  // Typing and menu changes update the controls at once; the (slower) card list catches up behind them.
  const view = useDeferredValue(filter);
  const matching = useMemo(() => entries.filter((e) => matchesCard(e.card, view, { setName: e.set.name, owned: e.owned, favorites })), [entries, view, favorites]);
  const filtering = isFiltering(view);
  const matchingIds = useMemo(() => new Set(matching.map((e) => e.card.id)), [matching]);

  const cardIds = useMemo(() => entries.map((e) => e.card.id), [entries]);
  const { showPrices, prices, loading } = useCardPrices(cardIds);
  const priceById = useMemo(
    () => new Map(showPrices ? entries.map((e) => [e.card.id, ownedPrice(prices.get(e.card.id), e.owned)]) : []),
    [entries, prices, showPrices],
  );
  const priceOf = (e: OwnedCard) => priceById.get(e.card.id);
  // Sorting by value needs prices; if they're switched off, fall back to recently pulled.
  const order = sort === "value" && !showPrices ? "recent" : sort;
  const viewOrder = useDeferredValue(order);
  const pending = view !== filter || viewOrder !== order;
  const shown = useMemo(() => sortCards(matching, viewOrder, (e) => priceById.get(e.card.id)?.amount), [matching, viewOrder, priceById]);
  // Back to the first batch on a new search or sort, but not when prices arrive.
  const { limit, more, sentinel } = useIncremental(shown.length, `${JSON.stringify(view)}|${viewOrder}`);
  const copies = matching.reduce((n, e) => n + e.owned.total, 0);

  const chooseSort = (s: CardSort) => {
    if (s === "value" && !showPrices) updateSettings({ showPrices: true });
    setSort(s);
  };

  return (
    <main className="collection cards-page all-cards">
      {source.owner && (
        <nav className="crumbs">
          <a href={href.friends()}>← Friends</a>
        </nav>
      )}
      <h1>{whose(source)} cards</h1>
      <CollectionViewSwitch current="all" />

      {!pulls || !sets ? (
        <p className="muted loading-line" role="status">
          <Spinner />
          {progress[1] ? `Loading ${source.owner ? "their" : "your"} sets… ${progress[0]} of ${progress[1]}` : "Loading…"}
        </p>
      ) : entries.length === 0 ? (
        <p className="muted empty">
          {source.owner ? (
            `${source.owner.displayName} hasn't got any cards yet.`
          ) : (
            <>
              Nothing here yet. <a href={href.open()}>Open a pack</a>. Every card you pull is saved here.
            </>
          )}
        </p>
      ) : (
        <>
          <CardFilterBar cards={allCards} filter={filter} onChange={setFilter}>
            <label className="field">
              <span>Sort by</span>
              <select value={order} onChange={(e) => chooseSort(e.target.value as CardSort)}>
                {SORTS.map((s) => (
                  <option key={s} value={s}>
                    {CARD_SORT_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <PriceToggle />
          </CardFilterBar>

          <p className="muted summary" role="status">
            {pending && (
              <span className="updating">
                <Spinner /> Updating…{" "}
              </span>
            )}
            {filtering ? `${matching.length} of ${plural(entries.length, "card")}` : plural(entries.length, "card")} · {copies} {copies === 1 ? "copy" : "copies"}
            {showPrices && ` · worth ${formatTotals(pullsValue(filtering ? pulls.filter((p) => matchingIds.has(p.cardId) && (view.finish === "any" || pullHasFinish(p, view.finish))) : pulls, prices))}`}
            {showPrices && loading && (viewOrder === "value" ? " (loading prices, order may shift…)" : " (loading…)")}
          </p>

          {shown.length === 0 && !pending && <p className="muted empty">No cards match these filters.</p>}
          <ol className="binder-grid" aria-busy={pending}>
            {shown.slice(0, limit).map((e) => {
              const price = priceOf(e);
              const dex = dexNumber(e);
              return (
                <li key={e.card.id}>
                  <button
                    type="button"
                    className="binder-slot"
                    data-state="owned"
                    onClick={() => setSelected(e)}
                    aria-label={`${e.card.name}, ${e.set.name} #${e.card.localId}, ${e.card.rarity}, ×${e.owned.total}${favorites.has(e.card.id) ? ", favorite" : ""}`}
                  >
                    {e.card.image ? <RetryImg src={cardImage(e.card, "low")} alt="" loading="lazy" /> : <span className="no-scan">No scan</span>}
                    {e.owned.total > 1 && <span className="count">×{e.owned.total}</span>}
                    {favorites.has(e.card.id) && <span className="fav" aria-hidden="true">★</span>}
                  </button>
                  <span className="set-label">
                    {e.card.name}
                    <span className="muted"> · {e.set.name}</span>
                  </span>
                  <span className="caption">
                    #{e.card.localId}
                    {viewOrder === "dex" && dex !== undefined && ` · Dex ${pad(dex)}`}
                    {viewOrder !== "dex" && ` · ${e.card.rarity}`}
                    {price && <span className="price"> · {formatPrice(price)}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
          {more && (
            <p className="muted loading-line more-cards" ref={sentinel}>
              <Spinner /> Loading more cards…
            </p>
          )}
        </>
      )}

      {selected && (
        <CardDetail
          card={selected.card}
          official={selected.set.cardCount.official}
          owned={owned.get(selected.card.id)}
          layout={layoutFor(selected.set.serie.id)}
          onClose={() => setSelected(undefined)}
        />
      )}
    </main>
  );
}
