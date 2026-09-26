// Collection by rarity or finish: every card you own across all sets, grouped rarest first.

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { cardImage } from "../api/tcgdex";
import { href } from "../app/router";
import { layoutFor } from "../foil/layouts";
import { CardDetail } from "./CardDetail";
import { matchesCard, NO_FILTER, type CardFilter } from "./cardFilter";
import { CardFilterBar } from "./CardFilterBar";
import { useFavorites } from "./favorites";
import { FINISH_ORDER, finishCount, groupCards, pullHasFinish, sortRarities, type GroupBy, type OwnedCard, type Tile } from "./cardGroups";
import { FINISH_LABEL, type FinishKey } from "./pokedex";
import { formatPrice, priceFor } from "./prices";
import { ownership } from "./progress";
import { useCollectionSource, whose } from "./source";
import type { PullRecord } from "./store";
import { useOpenedSets } from "./useOpenedSets";
import { formatTotals, ownedPrice, PriceToggle, pullsValue, useCardPrices } from "./usePrices";
import { CollectionViewSwitch } from "./ViewSwitch";
import "./collection.css";
import { Spinner } from "../app/Spinner";
import { useIncremental } from "./useIncremental";
import { RetryImg } from "../app/RetryImg";

type Sort = "recent" | "set" | "copies" | "price";
const FINISH_HEADING: Record<FinishKey, string> = { firstEdition: "1st Edition", holo: "Holo", reverse: "Reverse holo", normal: "Normal" };
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function CardsPage() {
  const source = useCollectionSource();
  const [pulls, setPulls] = useState<PullRecord[]>();
  const [groupBy, setGroupBy] = useState<GroupBy>("rarity");
  const [finish, setFinish] = useState<FinishKey | "any">("any");
  const [rarity, setRarity] = useState("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [selected, setSelected] = useState<Tile>();
  // Rarity and finish have their own menus here, so the filter bar only searches and picks card and Pokémon type.
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
  // The controls change at once; the (slower) card list catches up with these deferred copies.
  const view = useDeferredValue(filter);
  const viewGroupBy = useDeferredValue(groupBy);
  const viewFinish = useDeferredValue(finish);
  const viewRarity = useDeferredValue(rarity);
  const matching = useMemo(() => entries.filter((e) => matchesCard(e.card, view, { setName: e.set.name, favorites })), [entries, view, favorites]);
  const rarities = useMemo(() => sortRarities(entries.map((e) => e.card.rarity)), [entries]);
  const groups = useMemo(() => groupCards(matching, { groupBy: viewGroupBy, finish: viewFinish, rarity: viewRarity }), [matching, viewGroupBy, viewFinish, viewRarity]);

  // Prices only for the cards on screen, so filters keep the fetching down.
  const visibleIds = useMemo(() => groups.flatMap((g) => g.tiles.map((t) => t.card.id)), [groups]);
  const { showPrices, prices, loading } = useCardPrices(visibleIds);
  const tilePrice = (t: Tile) => {
    const pricing = prices.get(t.card.id);
    return !t.finish || t.finish === "firstEdition" ? ownedPrice(pricing, t.owned) : priceFor(pricing, t.finish);
  };
  /** Value of the pulls behind these tiles, in finish `f` if given. */
  const value = (tiles: Tile[], f: FinishKey | "any") => {
    const ids = new Set(tiles.map((t) => t.card.id));
    return formatTotals(pullsValue((pulls ?? []).filter((p) => ids.has(p.cardId) && (f === "any" || pullHasFinish(p, f))), prices));
  };

  const compare: Record<Sort, (a: Tile, b: Tile) => number> = {
    recent: (a, b) => b.owned.lastPulledAt.localeCompare(a.owned.lastPulledAt),
    set: (a, b) => (b.set.releaseDate ?? "").localeCompare(a.set.releaseDate ?? "") || a.card.localId.localeCompare(b.card.localId, undefined, { numeric: true }),
    copies: (a, b) => b.count - a.count,
    price: (a, b) => (tilePrice(b)?.amount ?? -1) - (tilePrice(a)?.amount ?? -1),
  };
  const order = sort === "price" && !showPrices ? "recent" : sort;
  const viewOrder = useDeferredValue(order);
  const pending = view !== filter || viewGroupBy !== groupBy || viewFinish !== finish || viewRarity !== rarity || viewOrder !== order;
  const shown = groups.map((g) => ({ ...g, tiles: [...g.tiles].sort((a, b) => compare[viewOrder](a, b) || compare.recent(a, b)) }));
  // Draw a batch of tiles at a time across the groups, back to the first batch on a new search, filter or sort.
  const { limit, more, sentinel } = useIncremental(visibleIds.length, `${JSON.stringify(view)}|${viewGroupBy}|${viewFinish}|${viewRarity}|${viewOrder}`);
  let budget = limit;
  const drawn = shown
    .map((g) => {
      const tiles = g.tiles.slice(0, Math.max(0, budget));
      budget -= tiles.length;
      return { ...g, all: g.tiles, tiles };
    })
    .filter((g) => g.tiles.length);
  const cardCount = new Set(visibleIds).size;
  // In finish groups a 1st Edition copy is also a holo or normal one; count it once.
  const counted = viewGroupBy === "finish" && viewFinish === "any" ? groups.filter((g) => g.key !== "firstEdition") : groups;
  const copies = counted.reduce((n, g) => n + g.tiles.reduce((m, t) => m + t.count, 0), 0);

  return (
    <main className="collection cards-page">
      {source.owner && (
        <nav className="crumbs">
          <a href={href.friends()}>← Friends</a>
        </nav>
      )}
      <h1>{whose(source)} cards</h1>
      <CollectionViewSwitch current="cards" />

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
          <div className="toolbar">
            <div role="group" aria-label="Group by" className="segmented">
              {(["rarity", "finish"] as GroupBy[]).map((g) => (
                <button key={g} type="button" aria-pressed={groupBy === g} onClick={() => setGroupBy(g)}>
                  By {g}
                </button>
              ))}
            </div>
          </div>
          <CardFilterBar cards={allCards} filter={filter} onChange={setFilter} hide={["rarity", "finish"]} pageFiltersInUse={(rarity !== "all" ? 1 : 0) + (finish !== "any" ? 1 : 0)}>
            <label className="field">
              <span>Sort by</span>
              <select value={order} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="recent">Recently pulled</option>
                <option value="set">Newest set</option>
                <option value="copies">Most copies</option>
                {showPrices && <option value="price">Highest price</option>}
              </select>
            </label>
            <PriceToggle />
            <label className="field">
              <span>Rarity</span>
              <select value={rarity} onChange={(e) => setRarity(e.target.value)}>
                <option value="all">All rarities</option>
                {rarities.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Finish</span>
              <select value={finish} onChange={(e) => setFinish(e.target.value as FinishKey | "any")}>
                <option value="any">Any</option>
                {FINISH_ORDER.map((k) => (
                  <option key={k} value={k}>
                    {FINISH_HEADING[k]}
                  </option>
                ))}
              </select>
            </label>
          </CardFilterBar>

          <p className="muted summary" role="status">
            {pending && (
              <span className="updating">
                <Spinner /> Updating…{" "}
              </span>
            )}
            {plural(cardCount, "card")} · {copies} {copies === 1 ? "copy" : "copies"}
            {showPrices && ` · worth ${value(groups.flatMap((g) => g.tiles), viewFinish)}${loading ? " (loading…)" : ""}`}
          </p>

          {shown.length === 0 && !pending && <p className="muted empty">No cards match these filters.</p>}
          {drawn.map((g) => (
            <section key={g.key} aria-busy={pending}>
              <h2>
                {viewGroupBy === "finish" ? FINISH_HEADING[g.key as FinishKey] : g.key}{" "}
                <span className="muted">
                  · {plural(g.all.length, "card")}
                  {showPrices && ` · ${value(g.all, viewGroupBy === "finish" ? (g.key as FinishKey) : viewFinish)}`}
                </span>
              </h2>
              <ol className="binder-grid">
                {g.tiles.map((t) => {
                  const price = showPrices ? tilePrice(t) : undefined;
                  return (
                    <li key={t.card.id}>
                      <button
                        type="button"
                        className="binder-slot"
                        data-state="owned"
                        onClick={() => setSelected(t)}
                        aria-label={`${t.card.name}, ${t.set.name} #${t.card.localId}, ${t.card.rarity}, ×${t.count}${favorites.has(t.card.id) ? ", favorite" : ""}`}
                      >
                        {t.card.image ? <RetryImg src={cardImage(t.card, "low")} alt="" loading="lazy" /> : <span className="no-scan">No scan</span>}
                        {t.count > 1 && <span className="count">×{t.count}</span>}
                        {favorites.has(t.card.id) && <span className="fav" aria-hidden="true">★</span>}
                      </button>
                      <span className="set-label">
                        {t.card.name}
                        <span className="muted"> · {t.set.name}</span>
                      </span>
                      <span className="caption">
                        #{t.card.localId}
                        {viewGroupBy === "finish" ? ` · ${t.card.rarity}` : ""}
                        {price && <span className="price"> · {formatPrice(price)}</span>}
                      </span>
                      {viewGroupBy === "rarity" && (
                        <ul className="finish-chips" aria-label="Finishes">
                          {FINISH_ORDER.filter((f) => finishCount(t.owned, f) > 0).map((f) => (
                            <li key={f} data-f={f} data-owned="true">
                              {FINISH_LABEL[f]} ×{finishCount(t.owned, f)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
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
