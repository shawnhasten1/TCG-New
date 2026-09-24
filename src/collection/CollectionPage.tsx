// Every set you've opened (or a friend has), with progress, most recent first.

import { useEffect, useMemo, useState } from "react";
import { GuestNotice } from "../account/GuestNotice";
import type { SetSummary } from "../api/types";
import { client } from "../app/client";
import { href } from "../app/router";
import { countPacks, tallyBySet } from "./progress";
import { useCollectionSource, whose } from "./source";
import type { PullRecord } from "./store";
import { formatTotals, PriceToggle, pullsValue, useCardPrices } from "./usePrices";
import { CollectionViewSwitch } from "./ViewSwitch";
import "./collection.css";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function CollectionPage() {
  const source = useCollectionSource();
  const [pulls, setPulls] = useState<PullRecord[]>();
  /** Undefined until loaded; empty if the set list couldn't be fetched (names fall back to ids). */
  const [sets, setSets] = useState<SetSummary[]>();

  useEffect(() => {
    let live = true;
    const reload = () => source.getPulls().then((p) => live && setPulls(p));
    void reload();
    client.listSetSummaries().then(
      (s) => live && setSets(s),
      () => live && setSets([]),
    );
    const off = source.onChange(reload);
    return () => {
      live = false;
      off();
    };
  }, [source]);

  const byId = useMemo(() => new Map((sets ?? []).map((s) => [s.id, s])), [sets]);
  const tallies = useMemo(
    () => [...tallyBySet(pulls ?? [], (id) => byId.get(id)?.cardCount.official).values()].sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt)),
    [pulls, byId],
  );

  const cardIds = useMemo(() => pulls?.map((p) => p.cardId) ?? [], [pulls]);
  const { showPrices, prices, loading } = useCardPrices(cardIds);
  const values = useMemo(() => {
    if (!showPrices || !pulls) return undefined;
    const bySet = new Map<string, PullRecord[]>();
    for (const p of pulls) (bySet.get(p.setId) ?? bySet.set(p.setId, []).get(p.setId)!).push(p);
    return { all: pullsValue(pulls, prices), bySet: new Map([...bySet].map(([id, ps]) => [id, pullsValue(ps, prices)])) };
  }, [showPrices, pulls, prices]);

  const totals = {
    pulls: pulls?.length ?? 0,
    packs: countPacks(pulls ?? []),
    unique: new Set(pulls?.map((p) => p.cardId)).size,
  };

  return (
    <main className="collection">
      {source.owner && (
        <nav className="crumbs">
          <a href={href.friends()}>← Friends</a>
        </nav>
      )}
      <h1>{whose(source)} collection</h1>
      {source.owner && (
        <p>
          <a className="button primary" href={href.trade(source.owner.id)}>
            Propose a trade
          </a>
        </p>
      )}
      {!source.owner && <GuestNotice />}
      <CollectionViewSwitch current="set" />
      {!pulls || !sets ? (
        <p className="muted" role="status">
          Loading…
        </p>
      ) : tallies.length === 0 ? (
        <p className="muted empty">
          {source.owner ? (
            `${source.owner.displayName} hasn't got any cards yet.`
          ) : (
            <>
              Nothing here yet. <a href={href.open()}>Open a pack</a>. Every card you pull is saved here.
            </>
          )}
        </p>
      ) : (
        <>
          <div className="toolbar">
            <p className="muted">
              {plural(totals.packs, "pack")} opened · {plural(totals.pulls, "card")} pulled · {totals.unique} different
              {values && ` · worth ${formatTotals(values.all)}${loading ? " (loading…)" : ""}`}
            </p>
            <PriceToggle />
          </div>
          <ul className="set-progress">
            {tallies.map((t) => {
              const s = byId.get(t.setId);
              const official = s?.cardCount.official ?? 0;
              const pct = official ? Math.min(100, (t.mainOwned / official) * 100) : 0;
              return (
                <li key={t.setId}>
                  <a href={source.links.binder(t.setId)}>
                    <div className="logo">{s?.logo ? <img src={`${s.logo}.webp`} alt="" loading="lazy" /> : <span>{s?.name ?? t.setId}</span>}</div>
                    <div className="meta">
                      <strong>{s?.name ?? t.setId}</strong>
                      <div className="bar" aria-hidden="true">
                        <div style={{ width: `${pct}%` }} />
                      </div>
                      <span className="muted">
                        {t.mainOwned} / {official || "?"} main set · {plural(t.packs, "pack")} · {plural(t.pulls, "card")}
                        {values && ` · ${formatTotals(values.bySet.get(t.setId)!)}`}
                      </span>
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </main>
  );
}
