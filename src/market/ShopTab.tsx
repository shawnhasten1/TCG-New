// #/market/shop: buy a pack from a set of your choice with coins. Sets are grouped by how scarce they are, cheapest
// tier first; the pack's wrapper is still random, as with any pack.

import { useEffect, useMemo, useState } from "react";
import type { SetSummary } from "../api/types";
import { client } from "../app/client";
import { href } from "../app/router";
import { Help } from "../app/Help";
import { SetLogo } from "../app/SetLogo";
import { setTier, TIERS, type SetTier } from "../engine/setRarity";
import { packArts } from "../packs/art";
import { buyPack, loadWallet } from "./market";
import { formatCoins } from "./protocol";
import { shopSets, type ShopEntry } from "./shop";
import { ask } from "../app/Confirm";

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
  /** The pack just bought, to open now or keep. */
  const [bought, setBought] = useState<{ id: string; name: string; unopened: number }>();
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
    const ok = await ask({
      title: `Buy a ${set.name} pack?`,
      body: coins === undefined ? undefined : `You'll have ${formatCoins(coins - entry.price)} left.`,
      confirm: `Buy for ${formatCoins(entry.price)}`,
    });
    if (!ok) return;
    setBusy(set.id);
    setError(undefined);
    setBought(undefined);
    try {
      const res = await buyPack(set.id);
      setCoins(res.coins);
      setBought({ id: res.pack.id, name: set.name, unopened: res.unopened });
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <>
      <div className="market-head">
        <div className="head-info">
          <p className="balance">
            <span className="muted">Balance</span> <strong>{coins === undefined ? "…" : formatCoins(coins)}</strong>
          </p>
          <Help
            label="How the shop works"
            lines={[
              "Pick a set and buy a pack from it. Which wrapper you get is luck.",
              "Scarcer sets cost more, and a few cost extra because their cards are worth more.",
              "A pack costs more than its cards usually sell for, so the shop is for chasing a set, not making coins.",
            ]}
          />
        </div>
      </div>
      <div className="pick-toolbar">
        <input type="search" placeholder="Search sets" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search sets" />
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {bought && (
        <div className="bought" role="status">
          <p className="ok">Bought a {bought.name} pack.</p>
          <div className="row">
            <a className="button primary" href={href.openBought(bought.id)}>
              Open now
            </a>
            <button type="button" onClick={() => setBought(undefined)}>
              Keep for later
            </button>
            <a href={href.unopened()}>
              Unopened packs ({bought.unopened})
            </a>
          </div>
        </div>
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
