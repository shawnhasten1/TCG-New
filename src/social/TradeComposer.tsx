// #/trade/<friendId>: put an offer together. Pick cards of theirs you'd like and cards of yours to give, then send it.
// Copies of the same card (same finish) share a tile; tapping it adds another copy until they're all picked, then clears.

import { useEffect, useMemo, useState } from "react";
import { cardImage } from "../api/tcgdex";
import type { Card, SetDetail } from "../api/types";
import { isMember, useAccount } from "../account/account";
import { href } from "../app/router";
import { friendPulls, fetchFriend } from "../collection/source";
import { getPulls, onCollectionChange, pullUid, type PullRecord } from "../collection/store";
import { useOpenedSets } from "../collection/useOpenedSets";
import { pullTier } from "../engine/tiers";
import type { Finish } from "../engine/types";
import { Avatar } from "./common";
import { MAX_TRADE_CARDS, type FriendProfile } from "./protocol";
import { proposeTrade } from "./trades";
import "../collection/collection.css";
import "./social.css";

type Side = "theirs" | "mine";

/** Copies of one card in one finish that someone owns. */
interface Pickable {
  key: string;
  card: Card;
  set: SetDetail;
  finish: Finish;
  firstEdition: boolean;
  uids: string[];
  tier: number;
}

function pickables(pulls: PullRecord[], cards: Map<string, { card: Card; set: SetDetail }>): Pickable[] {
  const groups = new Map<string, Pickable>();
  for (const p of pulls) {
    const found = cards.get(p.cardId);
    if (!found) continue;
    const key = `${p.cardId}|${p.finish}|${p.firstEdition ? 1 : 0}`;
    let g = groups.get(key);
    if (!g) {
      const tier = pullTier({ card: found.card, finish: p.finish, firstEdition: p.firstEdition, slot: "", outcome: "" });
      groups.set(key, (g = { key, ...found, finish: p.finish, firstEdition: p.firstEdition, uids: [], tier }));
    }
    g.uids.push(pullUid(p));
  }
  // Best cards first, then by set and number.
  return [...groups.values()].sort((a, b) => b.tier - a.tier || a.set.name.localeCompare(b.set.name) || a.card.localId.localeCompare(b.card.localId, undefined, { numeric: true }));
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const plural = (n: number) => `${n} ${n === 1 ? "card" : "cards"}`;

export function TradeComposer({ friendId }: { friendId: string }) {
  const member = isMember(useAccount());
  const [friend, setFriend] = useState<FriendProfile>();
  const [theirPulls, setTheirPulls] = useState<PullRecord[]>();
  const [myPulls, setMyPulls] = useState<PullRecord[]>();
  const [error, setError] = useState<string>();
  const [side, setSide] = useState<Side>("theirs");
  const [search, setSearch] = useState("");
  const [dupesOnly, setDupesOnly] = useState(false);
  /** Copies picked per tile, each side. */
  const [picked, setPicked] = useState<Record<Side, Map<string, number>>>({ theirs: new Map(), mine: new Map() });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!member) return;
    let live = true;
    fetchFriend(friendId, true).then(
      (res) => live && (setFriend(res.owner), setTheirPulls(friendPulls(res))),
      (err) => live && setError(message(err)),
    );
    // Yours come from this device, which a sync may still be filling in.
    const reload = () => getPulls().then((p) => live && setMyPulls(p));
    void reload();
    const off = onCollectionChange(reload);
    return () => {
      live = false;
      off();
    };
  }, [friendId, member]);

  // Card data for every set either of you has cards from.
  const both = useMemo(() => (theirPulls && myPulls ? [...theirPulls, ...myPulls] : undefined), [theirPulls, myPulls]);
  const { sets, progress } = useOpenedSets(both);
  const cards = useMemo(() => {
    const m = new Map<string, { card: Card; set: SetDetail }>();
    for (const d of sets ?? []) for (const card of d.cards) m.set(card.id, { card, set: d.set });
    return m;
  }, [sets]);
  const lists = useMemo(() => ({ theirs: pickables(theirPulls ?? [], cards), mine: pickables(myPulls ?? [], cards) }), [theirPulls, myPulls, cards]);

  const total = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  const count = (s: Side) => total(picked[s]);
  const cycle = (s: Side, p: Pickable) =>
    setPicked((cur) => {
      const next = new Map(cur[s]);
      const n = next.get(p.key) ?? 0;
      // Add a copy while there are more and room for them; otherwise start over.
      if (n < p.uids.length && total(cur[s]) < MAX_TRADE_CARDS) next.set(p.key, n + 1);
      else next.delete(p.key);
      return { ...cur, [s]: next };
    });
  const uidsFor = (s: Side) => lists[s].flatMap((p) => p.uids.slice(0, picked[s].get(p.key) ?? 0));

  const send = async () => {
    setSending(true);
    setError(undefined);
    try {
      await proposeTrade({ to: friendId, get: uidsFor("theirs"), give: uidsFor("mine") });
      location.hash = href.trades();
    } catch (err) {
      setError(message(err));
      setSending(false);
    }
  };

  const q = search.trim().toLowerCase();
  const shown = lists[side].filter((p) => (!q || p.card.name.toLowerCase().includes(q) || p.set.name.toLowerCase().includes(q)) && (!dupesOnly || p.uids.length > 1));
  const get = count("theirs");
  const give = count("mine");

  return (
    <main className="collection friends trade-composer">
      <nav className="crumbs">
        <a href={href.trades()}>← Trades</a>
        {friend && <a href={href.friend(friendId)}>{friend.displayName}'s collection</a>}
      </nav>
      <h1>{friend ? `Trade with ${friend.displayName}` : "Trade"}</h1>
      {!member ? (
        <p className="muted empty">
          <a href={href.settings()}>Sign up or sign in</a> to trade.
        </p>
      ) : error && !friend ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : !friend || !sets ? (
        <p className="muted" role="status">
          {progress[1] ? `Loading cards… ${progress[0]} of ${progress[1]} sets` : "Loading…"}
        </p>
      ) : (
        <>
          <p className="muted who-line">
            <Avatar friend={friend} /> Pick cards of theirs you'd like and cards of yours to give (up to {MAX_TRADE_CARDS} each). Either side can be empty, for a gift.
          </p>
          <nav className="segmented view-switch" aria-label="Whose cards">
            <button type="button" aria-pressed={side === "theirs"} onClick={() => setSide("theirs")}>
              Their cards{get ? ` (${get})` : ""}
            </button>
            <button type="button" aria-pressed={side === "mine"} onClick={() => setSide("mine")}>
              Your cards{give ? ` (${give})` : ""}
            </button>
          </nav>
          <div className="pick-toolbar">
            <input type="search" placeholder="Search by card or set" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search cards" />
            <label>
              <input type="checkbox" checked={dupesOnly} onChange={(e) => setDupesOnly(e.target.checked)} /> Duplicates only
            </label>
          </div>
          {shown.length === 0 ? (
            <p className="muted empty">{lists[side].length ? "No cards match." : side === "theirs" ? `${friend.displayName} hasn't got any cards yet.` : "You haven't got any cards yet."}</p>
          ) : (
            <ul className="pick-grid">
              {shown.map((p) => {
                const n = picked[side].get(p.key) ?? 0;
                const lastCopy = side === "mine" && n > 0 && n === p.uids.length;
                return (
                  <li key={p.key} data-finish={p.finish} data-tier={p.tier} data-picked={n > 0 || undefined}>
                    <button type="button" aria-pressed={n > 0} aria-label={`${p.card.name}, ${p.set.name}${p.finish !== "normal" ? `, ${p.finish}` : ""}, ${p.uids.length} owned${n ? `, ${n} picked` : ""}`} onClick={() => cycle(side, p)}>
                      <img src={cardImage(p.card, "low")} alt="" loading="lazy" />
                      {p.uids.length > 1 && <span className="count">×{p.uids.length}</span>}
                      {n > 0 && <span className="pick-check">{p.uids.length > 1 ? n : "✓"}</span>}
                    </button>
                    <span className="caption">
                      <strong>{p.card.name}</strong>
                      <small>
                        {p.set.name}
                        {p.finish !== "normal" ? ` · ${p.finish}` : ""}
                        {p.firstEdition ? " · 1st Ed" : ""}
                      </small>
                      {lastCopy && <small className="warn">Your last copy</small>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="offer-bar">
            <span>
              You get <strong>{plural(get)}</strong> · You give <strong>{plural(give)}</strong>
            </span>
            {error && (
              <span className="error" role="alert">
                {error}
              </span>
            )}
            <button type="button" className="primary" disabled={sending || (!get && !give)} onClick={() => void send()}>
              {sending ? "Sending…" : "Send offer"}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
