// Collection by rarity or finish: every card you own across all sets, grouped rarest first.

import { useEffect, useMemo, useState } from "react";
import { cardImage } from "../api/tcgdex";
import { href } from "../app/router";
import { layoutFor } from "../foil/layouts";
import { CardDetail } from "./CardDetail";
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
  const rarities = useMemo(() => sortRarities(entries.map((e) => e.card.rarity)), [entries]);
  const groups = useMemo(() => groupCards(entries, { groupBy, finish, rarity }), [entries, groupBy, finish, rarity]);

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
  const shown = groups.map((g) => ({ ...g, tiles: [...g.tiles].sort((a, b) => compare[order](a, b) || compare.recent(a, b)) }));
  const cardCount = new Set(visibleIds).size;
  // In finish groups a 1st Edition copy is also a holo or normal one; count it once.
  const counted = groupBy === "finish" && finish === "any" ? groups.filter((g) => g.key !== "firstEdition") : groups;
  const copies = counted.reduce((n, g) => n + g.tiles.reduce((m, t) => m + t.count, 0), 0);

  return (
    <main className="collection cards-page">
      <nav className="crumbs">{source.owner ? <a href={href.friends()}>← Friends</a> : <a href={href.open()}>← Open packs</a>}</nav>
      <h1>{whose(source)} cards</h1>
      <CollectionViewSwitch current="cards" />

      {!pulls || !sets ? (
        <p className="muted" role="status">
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
            <label>
              Rarity{" "}
              <select value={rarity} onChange={(e) => setRarity(e.target.value)}>
                <option value="all">All rarities</option>
                {rarities.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Finish{" "}
              <select value={finish} onChange={(e) => setFinish(e.target.value as FinishKey | "any")}>
                <option value="any">Any</option>
                {FINISH_ORDER.map((k) => (
                  <option key={k} value={k}>
                    {FINISH_HEADING[k]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sort{" "}
              <select value={order} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="recent">Recently pulled</option>
                <option value="set">Newest set</option>
                <option value="copies">Most copies</option>
                {showPrices && <option value="price">Highest price</option>}
              </select>
            </label>
            <PriceToggle />
          </div>

          <p className="muted summary">
            {plural(cardCount, "card")} · {copies} {copies === 1 ? "copy" : "copies"}
            {showPrices && ` · worth ${value(groups.flatMap((g) => g.tiles), finish)}${loading ? " (loading…)" : ""}`}
          </p>

          {shown.length === 0 && <p className="muted empty">No cards match these filters.</p>}
          {shown.map((g) => (
            <section key={g.key}>
              <h2>
                {groupBy === "finish" ? FINISH_HEADING[g.key as FinishKey] : g.key}{" "}
                <span className="muted">
                  · {plural(g.tiles.length, "card")}
                  {showPrices && ` · ${value(g.tiles, groupBy === "finish" ? (g.key as FinishKey) : finish)}`}
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
                        aria-label={`${t.card.name}, ${t.set.name} #${t.card.localId}, ${t.card.rarity}, ×${t.count}`}
                      >
                        {t.card.image ? <img src={cardImage(t.card, "low")} alt="" loading="lazy" /> : <span className="no-scan">No scan</span>}
                        {t.count > 1 && <span className="count">×{t.count}</span>}
                      </button>
                      <span className="set-label">
                        {t.card.name}
                        <span className="muted"> · {t.set.name}</span>
                      </span>
                      <span className="caption">
                        #{t.card.localId}
                        {groupBy === "finish" ? ` · ${t.card.rarity}` : ""}
                        {price && <span className="price"> · {formatPrice(price)}</span>}
                      </span>
                      {groupBy === "rarity" && (
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
