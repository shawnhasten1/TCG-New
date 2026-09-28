// The card index (#/index) in Magic and Yu-Gi-Oh!, where Pokémon has its Pokédex: every card you own, each printing of
// it counted as the same card (by the key the game gives it, gameCards.printings: Scryfall's oracle id, or the card's
// passcode), A to Z. Tap one for every printing of it (PrintingsPage). A card's data comes from the sets you've opened,
// already on the device.

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { GuestNotice } from "../account/GuestNotice";
import { cardImage } from "../api/tcgdex";
import type { Card } from "../api/types";
import { gameCards } from "../app/gameCards";
import { RetryImg } from "../app/RetryImg";
import { href } from "../app/router";
import { Spinner } from "../app/Spinner";
import { fold, queryWords } from "./cardFilter";
import { compareNames } from "./cardSort";
import { ownership } from "./progress";
import { getPulls, onCollectionChange, type PullRecord } from "./store";
import { useIncremental } from "./useIncremental";
import { useOpenedSets } from "./useOpenedSets";
import { CollectionViewSwitch } from "./ViewSwitch";
import "./collection.css";

interface Entry {
  key: string;
  name: string;
  /** The printing shown: the rarest you own, then the latest pulled. */
  card: Card;
  printings: number;
  copies: number;
  lastPulledAt: string;
}

type Sort = "name" | "recent" | "printings";
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const copies = (n: number) => (n === 1 ? "1 copy" : `${n} copies`);

export function CardIndexPage() {
  const [pulls, setPulls] = useState<PullRecord[]>();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("name");

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
  const entries = useMemo(() => {
    const printings = gameCards.printings;
    if (!printings) return [];
    const owned = ownership(pulls ?? []);
    const by = new Map<string, Entry>();
    for (const d of sets ?? []) {
      for (const card of d.cards) {
        const o = owned.get(card.id);
        const key = printings.key(card);
        if (!o || !key) continue;
        const e = by.get(key);
        if (!e) {
          by.set(key, { key, name: card.name, card, printings: 1, copies: o.total, lastPulledAt: o.lastPulledAt });
          continue;
        }
        e.printings++;
        e.copies += o.total;
        if (o.lastPulledAt > e.lastPulledAt) e.lastPulledAt = o.lastPulledAt;
        const better = printings.rarityRank(card.rarity) - printings.rarityRank(e.card.rarity) || (o.lastPulledAt > (owned.get(e.card.id)?.lastPulledAt ?? "") ? 1 : -1);
        if (better > 0) e.card = card;
      }
    }
    return [...by.values()];
  }, [sets, pulls]);

  const view = useDeferredValue(query);
  const shown = useMemo(() => {
    const words = queryWords(view);
    const matching = entries.filter((e) => words.every((w) => fold(e.name).includes(w)));
    const order: Record<Sort, (a: Entry, b: Entry) => number> = {
      name: (a, b) => compareNames(a.name, b.name),
      recent: (a, b) => b.lastPulledAt.localeCompare(a.lastPulledAt),
      printings: (a, b) => b.printings - a.printings || compareNames(a.name, b.name),
    };
    return matching.sort(order[sort]);
  }, [entries, view, sort]);
  const { limit, more, sentinel } = useIncremental(shown.length, `${view}|${sort}`);

  return (
    <main className="collection cards-page">
      <h1>Card index</h1>
      <GuestNotice />
      <CollectionViewSwitch current="index" />

      {!pulls || !sets ? (
        <p className="muted loading-line" role="status">
          <Spinner />
          {progress[1] ? `Loading your sets… ${progress[0]} of ${progress[1]}` : "Loading…"}
        </p>
      ) : entries.length === 0 ? (
        <p className="muted empty">
          Nothing here yet. <a href={href.open()}>Open a pack</a>: every card you pull is indexed here, with each of its printings counted as the same card.
        </p>
      ) : (
        <>
          <div className="card-filters">
            <div className="search-row">
              <input type="search" placeholder="Search your cards" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search your cards" />
              <select className="series" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort by">
                <option value="name">A to Z</option>
                <option value="recent">Recently pulled</option>
                <option value="printings">Most printings</option>
              </select>
            </div>
          </div>
          <p className="muted summary" role="status">
            {query ? `${shown.length} of ${plural(entries.length, "card")}` : plural(entries.length, "different card")} · tap one for every printing of it
          </p>
          {shown.length === 0 && <p className="muted empty">No cards match.</p>}
          <ol className="binder-grid" aria-busy={view !== query}>
            {shown.slice(0, limit).map((e) => (
              <li key={e.key}>
                <a className="binder-slot" data-state="owned" href={href.printings(e.key)} aria-label={`${e.name}, ${plural(e.printings, "printing")} owned, ${copies(e.copies)}`}>
                  <RetryImg src={cardImage(e.card, "low")} alt="" loading="lazy" />
                  {e.copies > 1 && <span className="count">×{e.copies}</span>}
                </a>
                <span className="set-label">{e.name}</span>
                <span className="caption">
                  {plural(e.printings, "printing")} · {copies(e.copies)}
                </span>
              </li>
            ))}
          </ol>
          {more && (
            <p className="muted loading-line more-cards" ref={sentinel}>
              <Spinner /> Loading more cards…
            </p>
          )}
        </>
      )}
    </main>
  );
}
