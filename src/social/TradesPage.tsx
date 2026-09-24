// #/trades: offers waiting for you, offers you sent, and recent trades.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { cardImage } from "../api/tcgdex";
import { isMember, useAccount } from "../account/account";
import { href } from "../app/router";
import { CardDetail } from "../collection/CardDetail";
import { pullTier } from "../engine/tiers";
import { layoutFor } from "../foil/layouts";
import { Avatar, ago, SocialTabs } from "./common";
import type { Trade, TradeCard, TradesResponse, TradeStatus } from "./protocol";
import { acceptTrade, cancelTrade, declineTrade, loadTrades } from "./trades";
import "../collection/collection.css";
import "./social.css";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

const OUTCOME: Record<Exclude<TradeStatus, "pending">, string> = {
  accepted: "Done",
  declined: "Declined",
  cancelled: "Called off",
  failed: "Couldn't go through",
};

export function TradesPage() {
  const account = useAccount();
  const member = isMember(account);
  const [data, setData] = useState<TradesResponse>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [note, setNote] = useState<string>();
  const [selected, setSelected] = useState<TradeCard>();

  const refresh = useCallback(async () => {
    try {
      setData(await loadTrades());
    } catch (err) {
      setError(message(err));
    }
  }, []);

  useEffect(() => {
    if (!member) return;
    void refresh();
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [member, account.user?.id, refresh]);

  const run = async (t: Trade, what: "accept" | "decline" | "cancel") => {
    if (what === "accept" && !confirm(`Trade ${plural(t.get.length)} for ${plural(t.give.length)} with ${t.from.displayName}?`)) return;
    setBusy(t.id);
    setError(undefined);
    setNote(undefined);
    try {
      setData(await (what === "accept" ? acceptTrade : what === "decline" ? declineTrade : cancelTrade)(t.id));
      if (what === "accept") setNote(`Traded with ${t.from.displayName}. The cards are in your collection.`);
    } catch (err) {
      setError(message(err));
      void refresh();
    } finally {
      setBusy(undefined);
    }
  };

  const view = (t: Trade, actions: ReactNode, status?: string) => {
    const other = t.mine ? t.to : t.from;
    // Always from your side: what you get, and what you give.
    const youGet = t.mine ? t.get : t.give;
    const youGive = t.mine ? t.give : t.get;
    return (
      <li key={t.id} className="trade">
        <header>
          <Avatar friend={other} />
          <div className="who-text">
            <strong>{t.mine ? `You offered ${other.displayName}` : `${other.displayName} offered you`}</strong>
            <span className="muted">
              {ago(t.resolvedAt ?? t.createdAt)}
              {status && ` · ${status}`}
            </span>
          </div>
        </header>
        <div className="trade-sides">
          <TradeSide title="You get" cards={youGet} onSelect={setSelected} />
          <TradeSide title="You give" cards={youGive} onSelect={setSelected} />
        </div>
        {actions && <div className="row">{actions}</div>}
      </li>
    );
  };

  return (
    <main className="collection friends feed trades">
      <nav className="crumbs">
        <a href={href.open()}>← Open packs</a>
        <a href={href.collection()}>Your collection</a>
      </nav>
      <h1>Trades</h1>
      {!member ? (
        <p className="muted empty">
          Trade cards with your friends. <a href={href.settings()}>Sign up or sign in</a> to start.
        </p>
      ) : (
        <>
          <SocialTabs current="trades" />
          <p className="muted">
            To make an offer, open a friend from <a href={href.friends()}>your friends</a> and tap <strong>Trade</strong>.
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
          ) : (
            <>
              <section>
                <h3>Offers for you</h3>
                {data.incoming.length === 0 ? (
                  <p className="muted">No offers waiting.</p>
                ) : (
                  <ul className="trade-list">
                    {data.incoming.map((t) =>
                      view(
                        t,
                        <>
                          <button type="button" className="primary" disabled={!!busy} onClick={() => void run(t, "accept")}>
                            {busy === t.id ? "Trading…" : "Accept"}
                          </button>
                          <button type="button" disabled={!!busy} onClick={() => void run(t, "decline")}>
                            Decline
                          </button>
                        </>,
                      ),
                    )}
                  </ul>
                )}
              </section>
              {data.outgoing.length > 0 && (
                <section>
                  <h3>Waiting for them</h3>
                  <ul className="trade-list">
                    {data.outgoing.map((t) =>
                      view(
                        t,
                        <button type="button" disabled={!!busy} onClick={() => void run(t, "cancel")}>
                          Call it off
                        </button>,
                      ),
                    )}
                  </ul>
                </section>
              )}
              {data.history.length > 0 && (
                <section>
                  <h3>Recent trades</h3>
                  <ul className="trade-list">{data.history.map((t) => view(t, null, t.status === "pending" ? undefined : OUTCOME[t.status]))}</ul>
                </section>
              )}
            </>
          )}
        </>
      )}
      {selected && (
        <CardDetail card={selected.card} official={selected.set.official} layout={layoutFor(selected.set.serieId)} finish={selected.finish} onClose={() => setSelected(undefined)} />
      )}
    </main>
  );
}

const plural = (n: number) => `${n} ${n === 1 ? "card" : "cards"}`;

function TradeSide({ title, cards, onSelect }: { title: string; cards: TradeCard[]; onSelect(c: TradeCard): void }) {
  return (
    <div className="trade-side">
      <h4>{title}</h4>
      {cards.length === 0 ? (
        <p className="muted">Nothing</p>
      ) : (
        <div className="feed-cards">
          {cards.map((c) => (
            <figure key={c.uid} data-finish={c.finish} data-tier={pullTier({ card: c.card, finish: c.finish, firstEdition: c.firstEdition, slot: "", outcome: "" })}>
              <button type="button" aria-label={`Look closer at ${c.card.name}`} onClick={() => onSelect(c)}>
                <img src={cardImage(c.card, "low")} alt="" loading="lazy" />
              </button>
              <figcaption>
                {c.card.name}
                <small>
                  {c.set.name}
                  {c.finish !== "normal" ? ` · ${c.finish}` : ""}
                  {c.firstEdition ? " · 1st Ed" : ""}
                </small>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
