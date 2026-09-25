// #/market: cards you've listed and what the market offers for them, and #/market/wallet: your coins.
// Each listing shows the offer that's up now and counts down to the next; when it changes the page asks again.

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
import { formatCoins, OFFERS, type Listing, type MarketResponse, type WalletResponse } from "./protocol";
import "../collection/collection.css";
import "../social/social.css";
import "./market.css";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const plural = (n: number) => `${n} ${n === 1 ? "card" : "cards"}`;

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

  // Ask again once an offer on screen has been replaced.
  const serverNow = now + skew;
  const stale = !!data?.listings.some((l) => l.offer.until <= serverNow);
  useEffect(() => {
    if (stale) void refresh();
  }, [stale, refresh]);

  const sell = async (listings: Listing[]) => {
    const total = listings.reduce((sum, l) => sum + l.offer.coins, 0);
    if (listings.length > 1 && !confirm(`Sell ${plural(listings.length)} for ${formatCoins(total)}?`)) return;
    setBusy(true);
    setError(undefined);
    setNote(undefined);
    try {
      const res = await sellListings(listings.map((l) => ({ id: l.id, n: l.offer.n })));
      show(res);
      const parts = [];
      if (res.sold) parts.push(`Sold ${plural(res.sold)} for ${formatCoins(res.earned)}.`);
      if (res.missed) parts.push(`${plural(res.missed)} couldn't be sold: the offer ran out, or the card isn't in your collection any more.`);
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

  // Offers that have just been replaced are on their way; only show what's still up.
  const live = data?.listings.filter((l) => l.offer.until > serverNow) ?? [];
  const total = live.reduce((sum, l) => sum + l.offer.coins, 0);

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
        List cards and the market makes an offer straight away. The first is usually low: wait and a new one replaces it every minute, up to {OFFERS}. Then
        the market loses interest until tomorrow.
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
  const share = Math.round((l.offer.coins / l.value) * 100);
  const left = clock(l.offer.until - now);
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
          <span className="offer-coins">{formatCoins(l.offer.coins)}</span> <span className="muted">({share}%)</span>
        </p>
        <small className="muted" aria-live="off">
          {l.offer.last ? `Last offer · withdrawn in ${left}` : `Offer ${l.offer.n + 1} of ${OFFERS} · next in ${left}`}
        </small>
      </div>
      <div className="listing-actions">
        <button type="button" className="primary" disabled={busy} onClick={onSell}>
          Sell
        </button>
        <button type="button" disabled={busy} onClick={onKeep}>
          Keep
        </button>
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
