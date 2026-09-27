// The Magic collection: every set packs come from, by booster era, with how much of each you've collected.
// Sets you haven't opened don't load their cards, so the page stays light until you do.

import { useEffect, useState } from "react";
import { GuestNotice } from "../account/GuestNotice";
import type { SetData } from "../api/types";
import { href } from "../app/router";
import { countPacks } from "../collection/progress";
import { getPulls, onCollectionChange, type PullRecord } from "../collection/store";
import { setSymbol } from "./cards";
import { getMtgSet } from "./client";
import { boosterEra, MTG_ERAS, MTG_SETS } from "./sets";
import "../collection/collection.css";
import "./mtg.css";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function MtgCollectionPage() {
  const [pulls, setPulls] = useState<PullRecord[]>();
  const [sets, setSets] = useState(new Map<string, SetData>());

  useEffect(() => {
    let live = true;
    const reload = () => getPulls().then((p) => live && setPulls(p));
    void reload();
    const off = onCollectionChange(reload);
    return () => {
      live = false;
      off();
    };
  }, []);

  // Card counts for the sets you've opened.
  useEffect(() => {
    let live = true;
    const opened = new Set(pulls?.map((p) => p.setId));
    for (const id of opened) {
      if (sets.has(id)) continue;
      getMtgSet(id).then(
        (d) => live && setSets((m) => new Map(m).set(id, d)),
        () => undefined,
      );
    }
    return () => {
      live = false;
    };
  }, [pulls, sets]);

  const bySet = new Map<string, PullRecord[]>();
  for (const p of pulls ?? []) (bySet.get(p.setId) ?? bySet.set(p.setId, []).get(p.setId)!).push(p);
  const unique = new Set(pulls?.map((p) => p.cardId)).size;

  return (
    <main className="collection mtg-collection">
      <h1>Magic collection</h1>
      <GuestNotice />
      {!pulls ? (
        <p className="muted" role="status">
          Loading…
        </p>
      ) : (
        <>
          <p className="muted">
            {pulls.length ? (
              <>
                {plural(countPacks(pulls), "pack")} opened · {plural(pulls.length, "card")} pulled · {unique} different
              </>
            ) : (
              <>
                Nothing here yet. <a href={href.open()}>Open a pack</a>: each comes from one of these sets, at random.
              </>
            )}
          </p>
          {MTG_ERAS.map((era) => (
            <section key={era.id}>
              <h2>{era.name}</h2>
              <ul className="set-progress">
                {MTG_SETS.filter((s) => boosterEra(s) === era.id).map((s) => {
                  const mine = bySet.get(s.id) ?? [];
                  const owned = new Set(mine.map((p) => p.cardId)).size;
                  const total = sets.get(s.id)?.cards.length;
                  const pct = total ? Math.min(100, (owned / total) * 100) : 0;
                  return (
                    <li key={s.id}>
                      <a href={href.binder(s.id)}>
                        <div className="logo">
                          <img src={setSymbol(s.id)} alt="" loading="lazy" />
                        </div>
                        <div className="meta">
                          <strong>{s.name}</strong>
                          <div className="bar" aria-hidden="true">
                            <div style={{ width: `${pct}%` }} />
                          </div>
                          <span className="muted">
                            {mine.length ? `${owned} / ${total ?? "?"} cards · ${plural(countPacks(mine), "pack")}` : `${s.id.toUpperCase()} · ${s.released.slice(0, 4)} · not opened yet`}
                          </span>
                        </div>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </>
      )}
    </main>
  );
}
