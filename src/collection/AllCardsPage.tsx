// Every card you own (Pokémon, Trainers and Energy) in one list, sorted by value, recently pulled, Pokédex number or name.

import { useEffect, useMemo, useState } from "react";
import { cardImage } from "../api/tcgdex";
import { href } from "../app/router";
import { updateSettings } from "../app/settings";
import { layoutFor } from "../foil/layouts";
import { CardDetail } from "./CardDetail";
import type { OwnedCard } from "./cardGroups";
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

const SORTS: CardSort[] = ["value", "recent", "dex", "name"];
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const pad = (n: number) => String(n).padStart(4, "0");

export function AllCardsPage() {
  const source = useCollectionSource();
  const [pulls, setPulls] = useState<PullRecord[]>();
  const [sort, setSort] = useState<CardSort>("recent");
  const [selected, setSelected] = useState<OwnedCard>();

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

  const cardIds = useMemo(() => entries.map((e) => e.card.id), [entries]);
  const { showPrices, prices, loading } = useCardPrices(cardIds);
  const priceById = useMemo(
    () => new Map(showPrices ? entries.map((e) => [e.card.id, ownedPrice(prices.get(e.card.id), e.owned)]) : []),
    [entries, prices, showPrices],
  );
  const priceOf = (e: OwnedCard) => priceById.get(e.card.id);
  // Sorting by value needs prices; if they're switched off, fall back to recently pulled.
  const order = sort === "value" && !showPrices ? "recent" : sort;
  const shown = useMemo(() => sortCards(entries, order, (e) => priceById.get(e.card.id)?.amount), [entries, order, priceById]);
  const copies = entries.reduce((n, e) => n + e.owned.total, 0);

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
            <label>
              Sort by{" "}
              <select value={order} onChange={(e) => chooseSort(e.target.value as CardSort)}>
                {SORTS.map((s) => (
                  <option key={s} value={s}>
                    {CARD_SORT_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <PriceToggle />
          </div>

          <p className="muted summary">
            {plural(entries.length, "card")} · {copies} {copies === 1 ? "copy" : "copies"}
            {showPrices && ` · worth ${formatTotals(pullsValue(pulls, prices))}`}
            {showPrices && loading && (order === "value" ? " (loading prices, order may shift…)" : " (loading…)")}
          </p>

          <ol className="binder-grid">
            {shown.map((e) => {
              const price = priceOf(e);
              const dex = dexNumber(e);
              return (
                <li key={e.card.id}>
                  <button
                    type="button"
                    className="binder-slot"
                    data-state="owned"
                    onClick={() => setSelected(e)}
                    aria-label={`${e.card.name}, ${e.set.name} #${e.card.localId}, ${e.card.rarity}, ×${e.owned.total}`}
                  >
                    {e.card.image ? <RetryImg src={cardImage(e.card, "low")} alt="" loading="lazy" /> : <span className="no-scan">No scan</span>}
                    {e.owned.total > 1 && <span className="count">×{e.owned.total}</span>}
                  </button>
                  <span className="set-label">
                    {e.card.name}
                    <span className="muted"> · {e.set.name}</span>
                  </span>
                  <span className="caption">
                    #{e.card.localId}
                    {order === "dex" && dex !== undefined && ` · Dex ${pad(dex)}`}
                    {order !== "dex" && ` · ${e.card.rarity}`}
                    {price && <span className="price"> · {formatPrice(price)}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
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
