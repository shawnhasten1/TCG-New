// The pack wrappers you've collected: each set's packs came in several designs (packs/art.ts), and every pack
// you open keeps the one it came in. Sets you've found wrappers for come first, most recent first.

import { useEffect, useMemo, useState } from "react";
import { GuestNotice } from "../account/GuestNotice";
import type { SetSummary } from "../api/types";
import { client } from "../app/client";
import { href } from "../app/router";
import { packArts, type PackArt } from "../packs/art";
import manifest from "../packs/packArt.json";
import { getWrappers, onCollectionChange, type WrapperRecord } from "./store";
import { CollectionViewSwitch } from "./ViewSwitch";
import "./collection.css";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

interface SetWrappers {
  setId: string;
  arts: PackArt[];
  /** Packs opened in each art, by art id. */
  counts: Map<string, number>;
  lastOpenedAt: string;
}

export function PacksPage() {
  const [wrappers, setWrappers] = useState<WrapperRecord[]>();
  const [sets, setSets] = useState<SetSummary[]>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let live = true;
    const reload = () => getWrappers().then((w) => live && setWrappers(w));
    void reload();
    client.listSetSummaries().then((s) => live && setSets(s), () => undefined);
    const off = onCollectionChange(reload);
    return () => {
      live = false;
      off();
    };
  }, []);

  const byId = useMemo(() => new Map(sets.map((s) => [s.id, s])), [sets]);

  const groups = useMemo(() => {
    const bySet = new Map<string, SetWrappers>();
    for (const setId of Object.keys(manifest)) bySet.set(setId, { setId, arts: packArts(setId), counts: new Map(), lastOpenedAt: "" });
    for (const w of wrappers ?? []) {
      const g = bySet.get(w.setId);
      if (!g) continue; // a set whose photos have since been dropped
      g.counts.set(w.art, (g.counts.get(w.art) ?? 0) + 1);
      if (w.openedAt > g.lastOpenedAt) g.lastOpenedAt = w.openedAt;
    }
    const released = (id: string) => byId.get(id)?.releaseDate ?? "";
    const all = [...bySet.values()];
    const found = all.filter((g) => g.counts.size > 0).sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt));
    const rest = all.filter((g) => g.counts.size === 0).sort((a, b) => released(a.setId).localeCompare(released(b.setId)));
    return { found, rest, total: all.reduce((n, g) => n + g.arts.length, 0), collected: found.reduce((n, g) => n + g.counts.size, 0) };
  }, [wrappers, byId]);

  const shown = showAll ? [...groups.found, ...groups.rest] : groups.found;

  return (
    <main className="collection packs-page">
      <h1>Your collection</h1>
      <GuestNotice />
      <CollectionViewSwitch current="packs" />
      {!wrappers ? (
        <p className="muted" role="status">
          Loading…
        </p>
      ) : (
        <>
          <div className="toolbar">
            <p className="muted">
              {groups.collected} of {groups.total} pack designs found · {plural(wrappers.length, "wrapper")} kept
            </p>
            <label className="show-all">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show every set
            </label>
          </div>
          {shown.length === 0 && (
            <p className="muted empty">
              Most sets' packs come in a few designs, and every pack you open keeps its wrapper here. <a href={href.open()}>Open a pack</a> to start.
            </p>
          )}
          {shown.map((g) => {
            const name = byId.get(g.setId)?.name ?? g.setId;
            return (
              <section key={g.setId} className="wrapper-set" aria-label={name}>
                <h2>
                  {name} <span className="muted">
                    {g.counts.size} / {g.arts.length}
                  </span>
                </h2>
                <ul className="wrapper-grid">
                  {g.arts.map((a) => {
                    const count = g.counts.get(a.id) ?? 0;
                    return (
                      <li key={a.id} data-found={count > 0 || undefined}>
                        <div className="wrapper-img">
                          <img src={a.src} alt={count ? `${name} pack: ${a.name}` : `${name} pack not found yet`} loading="lazy" />
                          {count > 1 && <span className="count">×{count}</span>}
                        </div>
                        <span className={count ? undefined : "muted"}>{count ? a.name : "Not found yet"}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
          <p className="muted credit">
            Pack photos from <a href="https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_Trading_Card_Game#International_sets">Bulbapedia</a>.
          </p>
        </>
      )}
    </main>
  );
}
