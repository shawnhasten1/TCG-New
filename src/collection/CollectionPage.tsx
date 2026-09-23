// Every set you've opened, with progress, most recent first.

import { useEffect, useMemo, useState } from "react";
import type { SetSummary } from "../api/types";
import { client } from "../app/client";
import { href } from "../app/router";
import { tallyBySet } from "./progress";
import { getPulls, onCollectionChange, type PullRecord } from "./store";
import { CollectionViewSwitch } from "./ViewSwitch";
import "./collection.css";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function CollectionPage() {
  const [pulls, setPulls] = useState<PullRecord[]>();
  /** Undefined until loaded; empty if the set list couldn't be fetched (names fall back to ids). */
  const [sets, setSets] = useState<SetSummary[]>();

  useEffect(() => {
    let live = true;
    const reload = () => getPulls().then((p) => live && setPulls(p));
    void reload();
    client.listSetSummaries().then(
      (s) => live && setSets(s),
      () => live && setSets([]),
    );
    const off = onCollectionChange(reload);
    return () => {
      live = false;
      off();
    };
  }, []);

  const byId = useMemo(() => new Map((sets ?? []).map((s) => [s.id, s])), [sets]);
  const tallies = useMemo(
    () => [...tallyBySet(pulls ?? [], (id) => byId.get(id)?.cardCount.official).values()].sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt)),
    [pulls, byId],
  );

  const totals = {
    pulls: pulls?.length ?? 0,
    packs: new Set(pulls?.map((p) => p.packId)).size,
    unique: new Set(pulls?.map((p) => p.cardId)).size,
  };

  return (
    <main className="collection">
      <nav className="crumbs">
        <a href={href.open()}>← Open packs</a>
        <a href={href.settings()}>Settings &amp; backup</a>
      </nav>
      <h1>Your collection</h1>
      <CollectionViewSwitch current="set" />
      {!pulls || !sets ? (
        <p className="muted" role="status">
          Loading…
        </p>
      ) : tallies.length === 0 ? (
        <p className="muted empty">
          Nothing here yet. <a href={href.open()}>Open a pack</a>. Every card you pull is saved here.
        </p>
      ) : (
        <>
          <p className="muted">
            {plural(totals.packs, "pack")} opened · {plural(totals.pulls, "card")} pulled · {totals.unique} different
          </p>
          <ul className="set-progress">
            {tallies.map((t) => {
              const s = byId.get(t.setId);
              const official = s?.cardCount.official ?? 0;
              const pct = official ? Math.min(100, (t.mainOwned / official) * 100) : 0;
              return (
                <li key={t.setId}>
                  <a href={href.binder(t.setId)}>
                    <div className="logo">{s?.logo ? <img src={`${s.logo}.webp`} alt="" loading="lazy" /> : <span>{s?.name ?? t.setId}</span>}</div>
                    <div className="meta">
                      <strong>{s?.name ?? t.setId}</strong>
                      <div className="bar" aria-hidden="true">
                        <div style={{ width: `${pct}%` }} />
                      </div>
                      <span className="muted">
                        {t.mainOwned} / {official || "?"} main set · {plural(t.packs, "pack")} · {plural(t.pulls, "card")}
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
