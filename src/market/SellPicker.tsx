// #/market/pick: choose cards to list on the market. Cards already listed are left out.

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import type { Card, SetDetail } from "../api/types";
import { isMember, useAccount } from "../account/account";
import { Help } from "../app/Help";
import { Spinner } from "../app/Spinner";
import { href } from "../app/router";
import { cyclePick, duplicatePicks, PickGrid, pickables, pickedCount, pickedUids, type Pickable, type Picked } from "../collection/PickGrid";
import { getPulls, onCollectionChange, pullUid, type PullRecord } from "../collection/store";
import { CARD_SORT_LABEL, sortCards, type CardSort } from "../collection/cardSort";
import { priceFor } from "../collection/prices";
import { useCardPrices } from "../collection/usePrices";
import { useOpenedSets } from "../collection/useOpenedSets";
import { useSyncStatus } from "../sync/sync";
import { listCards, loadMarket } from "./market";
import { coinValue, formatCoins, MAX_LIST_AT_ONCE, MAX_LISTED, type MarketResponse } from "./protocol";
import "../collection/collection.css";
import "../social/social.css";
import "./market.css";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const plural = (n: number) => `${n} ${n === 1 ? "card" : "cards"}`;
const SORTS: CardSort[] = ["rarity", "value", "recent", "dex", "name", "set"];

export function SellPicker() {
  const account = useAccount();
  const member = isMember(account);
  const sync = useSyncStatus();
  // On a device that hasn't got the collection yet, the first sync brings it in; until then "no cards" would be wrong.
  const syncing = !sync.lastSynced && (sync.state === "idle" || sync.state === "syncing");
  const [pulls, setPulls] = useState<PullRecord[]>();
  const [market, setMarket] = useState<MarketResponse>();
  const [error, setError] = useState<string>();
  const [search, setSearch] = useState("");
  const [dupesOnly, setDupesOnly] = useState(false);
  const [sort, setSort] = useState<CardSort>("rarity");
  const [picked, setPicked] = useState<Picked>(new Map());
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!member) return;
    let live = true;
    loadMarket().then(
      (res) => live && setMarket(res),
      (err) => live && setError(message(err)),
    );
    const reload = () => getPulls().then((p) => live && setPulls(p));
    void reload();
    const off = onCollectionChange(reload);
    return () => {
      live = false;
      off();
    };
  }, [member]);

  const { sets, progress } = useOpenedSets(pulls);
  const cards = useMemo(() => {
    const m = new Map<string, { card: Card; set: SetDetail }>();
    for (const d of sets ?? []) for (const card of d.cards) m.set(card.id, { card, set: d.set });
    return m;
  }, [sets]);
  const listed = useMemo(() => new Set(market?.listings.map((l) => l.card.uid)), [market]);
  const items = useMemo(() => pickables((pulls ?? []).filter((p) => !listed.has(pullUid(p))), cards), [pulls, cards, listed]);

  // What the market counts each card as, the same way the Worker does (prices are cached per day on the device).
  const { prices } = useCardPrices(useMemo(() => items.map((p) => p.card.id), [items]), true);
  const valueOf = useCallback(
    (p: Pickable) => (prices.has(p.card.id) ? coinValue(priceFor(prices.get(p.card.id), p.finish, p.firstEdition), p.card.rarity) : undefined),
    [prices],
  );
  const pickedValue = items.reduce((sum, p) => sum + (picked.get(p.key) ?? 0) * (valueOf(p)?.coins ?? 0), 0);
  const pickedPriced = items.every((p) => !picked.get(p.key) || prices.has(p.card.id));

  const room = Math.min(MAX_LIST_AT_ONCE, Math.max(0, MAX_LISTED - (market?.listings.length ?? 0)));
  const count = pickedCount(picked);
  const pick = (p: Pickable) => setPicked((cur) => cyclePick(cur, p, room));
  const pickDuplicates = () => setPicked(duplicatePicks(items, room));

  const list = async () => {
    setSending(true);
    setError(undefined);
    try {
      await listCards(pickedUids(items, picked));
      location.hash = href.market();
    } catch (err) {
      setError(message(err));
      setSending(false);
    }
  };

  // The controls change at once; the (slower) grid catches up with these deferred copies.
  const viewSearch = useDeferredValue(search);
  const viewSort = useDeferredValue(sort);
  const viewDupes = useDeferredValue(dupesOnly);
  const pending = viewSearch !== search || viewSort !== sort || viewDupes !== dupesOnly;
  const q = viewSearch.trim().toLowerCase();
  const shown = useMemo(
    () =>
      sortCards(
        items.filter((p) => (!q || p.card.name.toLowerCase().includes(q) || p.set.name.toLowerCase().includes(q)) && (!viewDupes || p.uids.length > 1)),
        viewSort,
        (p) => valueOf(p)?.coins,
      ),
    [items, q, viewDupes, viewSort, valueOf],
  );

  return (
    <main className="collection friends pick-page market">
      <nav className="crumbs">
        <a href={href.market()}>← Market</a>
      </nav>
      <h1>Choose cards to sell</h1>
      {account.status === "unknown" ? (
        <p className="muted loading-line" role="status">
          <Spinner /> Loading your cards…
        </p>
      ) : !member ? (
        <p className="muted empty">
          <a href={href.settings()}>Sign up or sign in</a> to sell cards.
        </p>
      ) : error && !market ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : !market || !pulls || !sets || (!items.length && syncing) ? (
        <p className="muted loading-line" role="status">
          <Spinner />
          {/* Your collection only stores which cards you have, so each set's card details are looked up (and kept on this device). */}
          {progress[1] ? `Looking up your cards… ${progress[0]} of ${progress[1]} sets` : "Loading your cards…"}
        </p>
      ) : room === 0 ? (
        <p className="muted empty">
          You have {MAX_LISTED} cards listed, the most at once. <a href={href.market()}>Sell or keep some</a> first.
        </p>
      ) : (
        <>
          <div className="market-head">
            <div className="head-info">
              <p className="muted">Pick up to {plural(room)}.</p>
              <Help
                label="About listing cards"
                lines={[
                  "Each card gets an offer as soon as it's listed, and you choose whether to sell.",
                  `Up to ${MAX_LISTED} cards can be on the market at once.`,
                  ...(listed.size ? [`${plural(listed.size)} you've listed already ${listed.size === 1 ? "isn't" : "aren't"} shown here.`] : []),
                ]}
              />
            </div>
          </div>
          <div className="pick-toolbar">
            <input type="search" placeholder="Search by card or set" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search cards" />
            <label>
              Sort by{" "}
              <select value={sort} onChange={(e) => setSort(e.target.value as CardSort)}>
                {SORTS.map((s) => (
                  <option key={s} value={s}>
                    {CARD_SORT_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <input type="checkbox" checked={dupesOnly} onChange={(e) => setDupesOnly(e.target.checked)} /> Duplicates only
            </label>
            <button type="button" onClick={pickDuplicates} disabled={!items.some((p) => p.uids.length > 1)}>
              Pick all duplicates
            </button>
          </div>
          {shown.length === 0 && !pending ? (
            <p className="muted empty">{items.length ? "No cards match." : "No cards to sell yet."}</p>
          ) : (
            <PickGrid
              items={shown}
              picked={picked}
              onPick={pick}
              warnLastCopy
              resetKey={`${q}|${viewSort}|${viewDupes}`}
              busy={pending}
              note={(p) => {
                const v = valueOf(p);
                return (
                  <small className="value" title={v && !v.priced ? "No market price, so this is an estimate for its rarity" : undefined}>
                    {v ? `${formatCoins(v.coins)}${v.priced ? "" : " (est.)"}` : "…"}
                  </small>
                );
              }}
            />
          )}
          <div className="offer-bar">
            <span>
              <strong>{plural(count)}</strong> picked
              {count > 0 && <> · worth {pickedPriced ? "" : "at least "}<strong>{formatCoins(pickedValue)}</strong></>}
            </span>
            {count > 0 && (
              <button type="button" onClick={() => setPicked(new Map())}>
                Clear
              </button>
            )}
            {error && (
              <span className="error" role="alert">
                {error}
              </span>
            )}
            <button type="button" className="primary" disabled={sending || !count} onClick={() => void list()}>
              {sending ? "Getting offers…" : "Get offers"}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
