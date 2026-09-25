// #/market: cards you've listed and the offers trainers have made for them, and #/market/wallet: your coins.
// Each listing shows every offer so far with the best picked out, and counts down to the next; when one's due, the
// page asks again. Selling takes the best offer.

import { useCallback, useEffect, useRef, useState } from "react";
import { cardImage } from "../api/tcgdex";
import { isMember, useAccount } from "../account/account";
import { href } from "../app/router";
import { CardDetail } from "../collection/CardDetail";
import { pullTier } from "../engine/tiers";
import { layoutFor } from "../foil/layouts";
import { ago } from "../social/common";
import type { TradeCard } from "../social/protocol";
import { keepListings, loadMarket, loadWallet, sellListings } from "./market";
import { bestOffer, formatCoins, OFFERS, type Listing, type MarketResponse, type WalletResponse } from "./protocol";
import "../collection/collection.css";
import "../social/social.css";
import "./market.css";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const plural = (n: number) => `${n} ${n === 1 ? "card" : "cards"}`;
/** A listing always has its first offer. */
const best = (l: Listing) => bestOffer(l.offers)!;

/** "0:42". */
const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function MarketTabs({ current }: { current: "sell" | "wallet" }) {
  return (
    <nav className="segmented view-switch" aria-label="Market">
      <a href={href.market()} aria-current={current === "sell" ? "page" : undefined}>
        Sell
      </a>
      <a href={href.wallet()} aria-current={current === "wallet" ? "page" : undefined}>
        Wallet
      </a>
    </nav>
  );
}

export function MarketPage({ tab }: { tab: "sell" | "wallet" }) {
  const member = isMember(useAccount());
  return (
    <main className="collection friends feed market">
      <h1>Market</h1>
      {!member ? (
        <p className="muted empty">
          Sell cards to the market for coins, and spend them on packs. <a href={href.settings()}>Sign up or sign in</a> to start.
        </p>
      ) : (
        <>
          <MarketTabs current={tab} />
          {tab === "wallet" ? <Wallet /> : <SellBoard />}
        </>
      )}
    </main>
  );
}

/* ---------- Sell ---------- */

function SellBoard() {
  const [data, setData] = useState<MarketResponse>();
  /** Server clock minus this device's, from the last response. */
  const [skew, setSkew] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string>();
  const [note, setNote] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<TradeCard>();
  const loading = useRef(false);

  const show = useCallback((res: MarketResponse) => {
    setData(res);
    setSkew(res.now - Date.now());
  }, []);

  const refresh = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      show(await loadMarket());
    } catch (err) {
      setError(message(err));
    } finally {
      loading.current = false;
    }
  }, [show]);

  useEffect(() => {
    void refresh();
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(tick);
    };
  }, [refresh]);

  // Ask again when an offer is due in, or a listing closes.
  const serverNow = now + skew;
  const stale = !!data?.listings.some((l) => (l.nextAt ?? l.closesAt) <= serverNow);
  useEffect(() => {
    if (stale) void refresh();
  }, [stale, refresh]);

  const sell = async (listings: Listing[]) => {
    const total = listings.reduce((sum, l) => sum + best(l).coins, 0);
    if (listings.length > 1 && !confirm(`Sell ${plural(listings.length)} for ${formatCoins(total)}?`)) return;
    setBusy(true);
    setError(undefined);
    setNote(undefined);
    try {
      const res = await sellListings(listings.map((l) => ({ id: l.id, n: best(l).n })));
      show(res);
      const parts = [];
      if (res.sold) parts.push(listings.length === 1 ? `Sold to ${best(listings[0]).from} for ${formatCoins(res.earned)}.` : `Sold ${plural(res.sold)} for ${formatCoins(res.earned)}.`);
      if (res.missed) parts.push(`${plural(res.missed)} couldn't be sold: the listing closed, or the card isn't in your collection any more.`);
      setNote(parts.join(" "));
    } catch (err) {
      setError(message(err));
      void refresh();
    } finally {
      setBusy(false);
    }
  };

  const keep = async (listings: Listing[]) => {
    setBusy(true);
    setError(undefined);
    setNote(undefined);
    try {
      show(await keepListings(listings.map((l) => l.id)));
      setNote(`Kept ${plural(listings.length)}. ${listings.length === 1 ? "It" : "They"} can be listed again tomorrow.`);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  // A listing that's just closed is on its way out; only show open ones.
  const live = data?.listings.filter((l) => l.closesAt > serverNow) ?? [];
  const total = live.reduce((sum, l) => sum + best(l).coins, 0);

  return (
    <>
      <div className="market-head">
        <p className="balance">
          <span className="muted">Balance</span> <strong>{data ? formatCoins(data.coins) : "…"}</strong>
        </p>
        <a className="button primary" href={href.marketPick()}>
          Choose cards to sell
        </a>
      </div>
      <p className="muted">
        List cards and trainers start making offers: the first straight away, usually a low one, then another every minute, up to {OFFERS}. Sell to the
        best offer whenever you like, until a minute after the last comes in. Then the market loses interest in the card until tomorrow.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {note && (
        <p className="ok" role="status">
          {note}
        </p>
      )}
      {!data ? (
        !error && (
          <p className="muted" role="status">
            Loading…
          </p>
        )
      ) : live.length === 0 ? (
        <p className="muted empty">Nothing listed. Choose some cards to see what the market will pay.</p>
      ) : (
        <>
          {live.length > 1 && (
            <div className="row bulk">
              <button type="button" className="primary" disabled={busy} onClick={() => void sell(live)}>
                Sell all {live.length} for {formatCoins(total)}
              </button>
              <button type="button" disabled={busy} onClick={() => void keep(live)}>
                Keep all
              </button>
            </div>
          )}
          <ul className="listing-list">
            {live.map((l) => (
              <ListingRow key={l.id} listing={l} now={serverNow} busy={busy} onSell={() => void sell([l])} onKeep={() => void keep([l])} onLook={() => setSelected(l.card)} />
            ))}
          </ul>
        </>
      )}
      {selected && (
        <CardDetail card={selected.card} official={selected.set.official} layout={layoutFor(selected.set.serieId)} finish={selected.finish} onClose={() => setSelected(undefined)} />
      )}
    </>
  );
}

function ListingRow({ listing: l, now, busy, onSell, onKeep, onLook }: { listing: Listing; now: number; busy: boolean; onSell(): void; onKeep(): void; onLook(): void }) {
  const c = l.card;
  const top = best(l);
  const pct = (coins: number) => `${Math.round((coins / l.value) * 100)}%`;
  // Offers that come in while the page is open flash as they arrive; the ones there on first load don't.
  const seen = useRef<number | null>(null);
  seen.current ??= l.offers.length;
  const arrived = (n: number) => n >= seen.current!;
  return (
    <li className="listing" data-finish={c.finish} data-tier={pullTier({ card: c.card, finish: c.finish, firstEdition: c.firstEdition, slot: "", outcome: "" })}>
      <button type="button" className="thumb" aria-label={`Look closer at ${c.card.name}`} onClick={onLook}>
        <img src={cardImage(c.card, "low")} alt="" loading="lazy" />
      </button>
      <div className="listing-body">
        <strong className="name">{c.card.name}</strong>
        <small className="muted">
          {c.set.name}
          {c.finish !== "normal" ? ` · ${c.finish}` : ""}
          {c.firstEdition ? " · 1st Ed" : ""}
        </small>
        <small className="muted">
          Worth {formatCoins(l.value)}
          {!l.priced && " (no market price, so an estimate for its rarity)"}
        </small>
        <p className="offer">
          <span className="offer-coins">{formatCoins(top.coins)}</span> <span className="muted">({pct(top.coins)})</span>
          <small className="muted">Best offer, from {top.from}</small>
        </p>
      </div>
      <div className="listing-actions">
        <button type="button" className="primary" disabled={busy} onClick={onSell}>
          Sell
        </button>
        <button type="button" disabled={busy} onClick={onKeep}>
          Keep
        </button>
      </div>
      <div className="offers">
        <ol reversed aria-label={`Offers for ${c.card.name}`}>
          {[...l.offers].reverse().map((o) => (
            <li key={o.n} data-best={o === top || undefined} data-new={arrived(o.n) || undefined}>
              <span className="who">{o.from}</span>
              <span className="coins">
                {formatCoins(o.coins)} <small className="muted">{pct(o.coins)}</small>
              </span>
              {o === top && <span className="best-chip">Best</span>}
            </li>
          ))}
        </ol>
        <small className="muted countdown">
          {l.nextAt !== null ? `${l.offers.length} of ${OFFERS} offers · next in ${clock(l.nextAt - now)}` : `All ${OFFERS} offers in · closes in ${clock(l.closesAt - now)}`}
        </small>
      </div>
    </li>
  );
}

/* ---------- Wallet ---------- */

function Wallet() {
  const [data, setData] = useState<WalletResponse>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let live = true;
    loadWallet().then(
      (res) => live && setData(res),
      (err) => live && setError(message(err)),
    );
    return () => {
      live = false;
    };
  }, []);

  if (error)
    return (
      <p className="error" role="alert">
        {error}
      </p>
    );
  if (!data)
    return (
      <p className="muted" role="status">
        Loading…
      </p>
    );
  return (
    <>
      <p className="balance">
        <span className="muted">Balance</span> <strong>{formatCoins(data.coins)}</strong>
      </p>
      {data.history.length === 0 ? (
        <p className="muted empty">
          No coins yet. <a href={href.marketPick()}>Sell some cards</a> to earn some.
        </p>
      ) : (
        <ul className="ledger">
          {data.history.map((e) => (
            <li key={e.id}>
              <span className="ledger-note">
                {e.note}
                <small className="muted">{ago(e.at)}</small>
              </span>
              <span className="ledger-amount" data-sign={e.amount > 0 ? "in" : "out"}>
                {e.amount > 0 ? "+" : "−"}
                {formatCoins(Math.abs(e.amount))}
                <small className="muted">{formatCoins(e.balance)}</small>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
