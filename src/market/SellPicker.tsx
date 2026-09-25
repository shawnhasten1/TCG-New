// #/market/pick: choose cards to list on the market. Cards already listed are left out.

import { useEffect, useMemo, useState } from "react";
import type { Card, SetDetail } from "../api/types";
import { isMember, useAccount } from "../account/account";
import { Help } from "../app/Help";
import { href } from "../app/router";
import { cyclePick, PickGrid, pickables, pickedCount, pickedUids, type Pickable, type Picked } from "../collection/PickGrid";
import { getPulls, onCollectionChange, pullUid, type PullRecord } from "../collection/store";
import { useOpenedSets } from "../collection/useOpenedSets";
import { listCards, loadMarket } from "./market";
import { MAX_LIST_AT_ONCE, MAX_LISTED, type MarketResponse } from "./protocol";
import "../collection/collection.css";
import "../social/social.css";
import "./market.css";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const plural = (n: number) => `${n} ${n === 1 ? "card" : "cards"}`;

export function SellPicker() {
  const member = isMember(useAccount());
  const [pulls, setPulls] = useState<PullRecord[]>();
  const [market, setMarket] = useState<MarketResponse>();
  const [error, setError] = useState<string>();
  const [search, setSearch] = useState("");
  const [dupesOnly, setDupesOnly] = useState(false);
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

  const room = Math.min(MAX_LIST_AT_ONCE, Math.max(0, MAX_LISTED - (market?.listings.length ?? 0)));
  const count = pickedCount(picked);
  const pick = (p: Pickable) => setPicked((cur) => cyclePick(cur, p, room));
  /** Every copy but one of each card, as far as there's room. */
  const pickDuplicates = () => {
    const next = new Map<string, number>();
    let left = room;
    for (const p of items) {
      const n = Math.min(p.uids.length - 1, left);
      if (n > 0) next.set(p.key, n);
      left -= Math.max(0, n);
    }
    setPicked(next);
  };

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

  const q = search.trim().toLowerCase();
  const shown = items.filter((p) => (!q || p.card.name.toLowerCase().includes(q) || p.set.name.toLowerCase().includes(q)) && (!dupesOnly || p.uids.length > 1));

  return (
    <main className="collection friends pick-page market">
      <nav className="crumbs">
        <a href={href.market()}>← Market</a>
      </nav>
      <h1>Choose cards to sell</h1>
      {!member ? (
        <p className="muted empty">
          <a href={href.settings()}>Sign up or sign in</a> to sell cards.
        </p>
      ) : error && !market ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : !market || !pulls || !sets ? (
        <p className="muted" role="status">
          {progress[1] ? `Loading cards… ${progress[0]} of ${progress[1]} sets` : "Loading…"}
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
              <input type="checkbox" checked={dupesOnly} onChange={(e) => setDupesOnly(e.target.checked)} /> Duplicates only
            </label>
            <button type="button" onClick={pickDuplicates} disabled={!items.some((p) => p.uids.length > 1)}>
              Pick all duplicates
            </button>
          </div>
          {shown.length === 0 ? (
            <p className="muted empty">{items.length ? "No cards match." : "No cards to sell yet."}</p>
          ) : (
            <PickGrid items={shown} picked={picked} onPick={pick} warnLastCopy />
          )}
          <div className="offer-bar">
            <span>
              <strong>{plural(count)}</strong> picked
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
