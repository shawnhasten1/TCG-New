// #/market/shop: buy a pack from a set of your choice with coins. Sets are grouped by how scarce they are, cheapest
// tier first; the pack's wrapper is still random, as with any pack.

import { useEffect, useMemo, useState } from "react";
import type { SetSummary } from "../api/types";
import { client } from "../app/client";
import { SetLogo } from "../app/SetLogo";
import { setTier, TIERS, type SetTier } from "../engine/setRarity";
import { packArts } from "../packs/art";
import { buyPack, loadWallet } from "./market";
import { formatCoins } from "./protocol";
import { shopSets, type ShopEntry } from "./shop";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

interface Item {
  set: SetSummary;
  entry: ShopEntry;
  tier: SetTier;
}

export function ShopTab() {
  const [sets, setSets] = useState<SetSummary[]>();
  const [coins, setCoins] = useState<number>();
  const [error, setError] = useState<string>();
  const [note, setNote] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [query, setQuery] = useState("");

  useEffect(() => {
    let live = true;
    client.listSetSummaries().then(
      (s) => live && setSets(s),
      (err) => live && setError(message(err)),
    );
    loadWallet().then(
      (w) => live && setCoins(w.coins),
      (err) => live && setError(message(err)),
    );
    return () => {
      live = false;
    };
  }, []);

  /** Tiers, cheapest first, with their sets cheapest first. */
  const groups = useMemo(() => {
    const sold = shopSets();
    const q = query.trim().toLowerCase();
    const items: Item[] = (sets ?? [])
      .filter((s) => Object.hasOwn(sold, s.id) && (!q || `${s.name} ${s.serie.name}`.toLowerCase().includes(q)))
      .map((set) => ({ set, entry: sold[set.id], tier: setTier(set.id) }));
    return TIERS.map((t) => ({ tier: t, items: items.filter((i) => i.tier === t.id).sort((a, b) => a.entry.price - b.entry.price || b.set.releaseDate.localeCompare(a.set.releaseDate)) }))
      .filter((g) => g.items.length);
  }, [sets, query]);

  const buy = async ({ set, entry }: Item) => {
    if (!confirm(`Buy a ${set.name} pack for ${formatCoins(entry.price)}?`)) return;
    setBusy(set.id);
    setError(undefined);
    setNote(undefined);
    try {
      const res = await buyPack(set.id);
      setCoins(res.coins);
      setNote(`Bought a ${set.name} pack. It's waiting with your unopened packs (${res.unopened}).`);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <>
      <div className="market-head">
        <p className="balance">
          <span className="muted">Balance</span> <strong>{coins === undefined ? "…" : formatCoins(coins)}</strong>
        </p>
      </div>
      <p className="muted">
        Pick the set you want a pack from. Which wrapper it comes in is still down to luck. Scarcer sets cost more, and a pack always costs more than its
        cards would sell for, so the shop is for chasing a set, not for making coins.
      </p>
      <div className="pick-toolbar">
        <input type="search" placeholder="Search sets" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search sets" />
      </div>
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
      {!sets ? (
        !error && (
          <p className="muted" role="status">
            Loading…
          </p>
        )
      ) : groups.length === 0 ? (
        <p className="muted empty">{query ? "No sets match." : "The shop has nothing for sale yet."}</p>
      ) : (
        groups.map((g) => (
          <section key={g.tier.id} className="shop-tier">
            <h3>{g.tier.name}s</h3>
            <ul className="shop-grid">
              {g.items.map((item) => {
                const art = packArts(item.set.id)[0];
                const short = coins !== undefined && coins < item.entry.price;
                return (
                  <li key={item.set.id} data-tier={item.tier}>
                    <div className="shop-pack">
                      {art ? <img src={art.src} alt="" loading="lazy" /> : <SetLogo logo={item.set.logo} alt="" loading="lazy" className="logo" fallback={<span className="logo-fallback">{item.set.name}</span>} />}
                    </div>
                    <strong className="name">{item.set.name}</strong>
                    <small className="muted">
                      {item.set.serie.name} · {item.set.releaseDate.slice(0, 4)}
                    </small>
                    <span className="price">{formatCoins(item.entry.price)}</span>
                    <button type="button" className="primary" disabled={!!busy || short} onClick={() => void buy(item)}>
                      {busy === item.set.id ? "Buying…" : short ? `Need ${formatCoins(item.entry.price - coins!)} more` : "Buy"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
