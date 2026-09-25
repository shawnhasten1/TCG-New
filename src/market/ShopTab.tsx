// #/market/shop: buy a pack from a set of your choice with coins. Sets are grouped by how scarce they are, and cheapest
// first within each group; the pack's wrapper is still random, as with any pack.

import { useEffect, useMemo, useState } from "react";
import type { SetSummary } from "../api/types";
import { client } from "../app/client";
import { href } from "../app/router";
import { Help } from "../app/Help";
import { SetLogo } from "../app/SetLogo";
import { setTier, TIERS, type SetTier } from "../engine/setRarity";
import { packArts } from "../packs/art";
import { buyPacks, loadUnopened, loadWallet } from "./market";
import { formatCoins } from "./protocol";
import { QuantityStepper } from "./QuantityStepper";
import { MAX_UNOPENED, maxQuantity, shopSets, type ShopEntry } from "./shop";
import { ask } from "../app/Confirm";
import { RetryImg } from "../app/RetryImg";

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
  /** The packs just bought, to open now or keep. */
  const [bought, setBought] = useState<{ id: string; name: string; count: number; unopened: number }>();
  /** Unopened packs held, which limits how many more can be bought. */
  const [unopened, setUnopened] = useState(0);
  /** How many of each set's packs to buy, where it isn't 1. */
  const [quantities, setQuantities] = useState<Map<string, number>>(new Map());
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
    loadUnopened().then(
      (u) => live && setUnopened(u.packs.length),
      () => undefined, // the server still enforces the limit
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

  /** The most of a set's packs that can be bought now, and how many are chosen (never more than that). */
  const limits = (item: Item) => {
    const max = coins === undefined ? 1 : maxQuantity(item.entry.price, coins, unopened);
    return { max, quantity: Math.min(quantities.get(item.set.id) ?? 1, Math.max(1, max)) };
  };
  const setQuantity = (setId: string, n: number) => setQuantities((m) => new Map(m).set(setId, n));

  const buy = async (item: Item) => {
    const { set, entry } = item;
    const { quantity } = limits(item);
    const total = entry.price * quantity;
    const ok = await ask({
      title: quantity === 1 ? `Buy a ${set.name} pack?` : `Buy ${quantity} ${set.name} packs?`,
      body: coins === undefined ? undefined : `You'll have ${formatCoins(coins - total)} left.`,
      confirm: `Buy for ${formatCoins(total)}`,
    });
    if (!ok) return;
    setBusy(set.id);
    setError(undefined);
    setBought(undefined);
    try {
      const res = await buyPacks(set.id, quantity);
      setCoins(res.coins);
      setUnopened(res.unopened);
      setBought({ id: res.packs[0].id, name: set.name, count: res.packs.length, unopened: res.unopened });
      setQuantity(set.id, 1);
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
              "Prices follow what a set's cards are worth, so sets with pricier cards cost more.",
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
          <p className="ok">{bought.count === 1 ? `Bought a ${bought.name} pack.` : `Bought ${bought.count} ${bought.name} packs.`}</p>
          <div className="row">
            <a className="button primary" href={href.openBought(bought.id)}>
              {bought.count === 1 ? "Open now" : "Open them now"}
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
                const full = unopened >= MAX_UNOPENED;
                const { max, quantity } = limits(item);
                return (
                  <li key={item.set.id} data-tier={item.tier}>
                    <div className="shop-pack">
                      {art ? <RetryImg src={art.src} alt="" loading="lazy" /> : <SetLogo logo={item.set.logo} alt="" loading="lazy" className="logo" fallback={<span className="logo-fallback">{item.set.name}</span>} />}
                    </div>
                    <strong className="name">{item.set.name}</strong>
                    <small className="muted">
                      {item.set.serie.name} · {item.set.releaseDate.slice(0, 4)}
                    </small>
                    <span className="price">{formatCoins(item.entry.price)}</span>
                    {!short && !full && max > 1 && (
                      <QuantityStepper value={quantity} max={max} onChange={(n) => setQuantity(item.set.id, n)} label={`How many ${item.set.name} packs`} disabled={!!busy} />
                    )}
                    <button type="button" className="primary" disabled={!!busy || short || full} onClick={() => void buy(item)}>
                      {busy === item.set.id
                        ? "Buying…"
                        : full
                          ? "No room for more"
                          : short
                            ? `Need ${formatCoins(item.entry.price - coins!)} more`
                            : quantity > 1
                              ? `Buy ${quantity} for ${(item.entry.price * quantity).toLocaleString()}`
                              : "Buy"}
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
