// Set browser (#/sets): sets by series (by booster era for Magic), each opening its binder. Packs themselves always come
// from a random set.

import { useEffect, useMemo, useState } from "react";
import type { SetSummary } from "../api/types";
import { getUnopenable } from "../app/client";
import { has } from "../app/game";
import { gameCards } from "../app/gameCards";
import { href } from "../app/router";
import { tallyBySet, type SetTally } from "../collection/progress";
import { getPulls, onCollectionChange } from "../collection/store";
import { useSettings } from "../app/settings";
import { ERAS, drawableSets } from "../engine/randomSet";
import { setTier, tierInfo } from "../engine/setRarity";
import "./picker.css";

interface Group {
  serie: { id: string; name: string };
  sets: (SetSummary & { hidden?: string })[];
  latest: string;
}

const dateFmt = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" });
const formatDate = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return isNaN(+d) ? iso : dateFmt.format(d);
};

export function SetPicker() {
  const [sets, setSets] = useState<SetSummary[]>();
  const [unopenable, setUnopenable] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [tallies, setTallies] = useState<Map<string, SetTally>>(new Map());

  useEffect(() => {
    gameCards.listSetSummaries().then(setSets, (e) => setError(e instanceof Error ? e.message : String(e)));
    getUnopenable().then(setUnopenable);
  }, []);

  useEffect(() => {
    if (!sets) return;
    const official = new Map(sets.map((s) => [s.id, s.cardCount.official]));
    const reload = () => getPulls().then((p) => setTallies(tallyBySet(p, (id) => official.get(id))), () => undefined);
    void reload();
    return onCollectionChange(reload);
  }, [sets]);

  const groups = useMemo(() => {
    if (!sets) return [];
    const q = query.trim().toLowerCase();
    const bySerie = new Map<string, Group>();
    for (const s of sets) {
      const hidden = gameCards.hiddenReason(s) ?? unopenable[s.id];
      if (hidden && !showHidden) continue;
      if (q && !`${s.name} ${s.id} ${s.serie.name}`.toLowerCase().includes(q)) continue;
      const g = bySerie.get(s.serie.id) ?? { serie: s.serie, sets: [], latest: "" };
      g.sets.push({ ...s, hidden });
      if (s.releaseDate > g.latest) g.latest = s.releaseDate;
      bySerie.set(s.serie.id, g);
    }
    const out = [...bySerie.values()].sort((a, b) => b.latest.localeCompare(a.latest));
    for (const g of out) g.sets.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate) || b.id.localeCompare(a.id));
    return out;
  }, [sets, unopenable, query, showHidden]);

  const shown = groups.reduce((n, g) => n + g.sets.length, 0);
  const anyHidden = !!sets?.some((s) => gameCards.hiddenReason(s) || unopenable[s.id]);
  const { eras } = useSettings();
  // Games without the era filter draw from every set they have.
  const drawable = !sets ? 0 : has("eraFilter") ? drawableSets(sets, { unopenable, eras }).length : sets.filter((s) => !gameCards.hiddenReason(s)).length;
  const eraNote = eras.length ? ERAS.filter((e) => eras.includes(e.id)).map((e) => e.name).join(", ") : "every era";

  return (
    <main className="picker">
      <header>
        <h1>All sets</h1>
        <p className="lede">Pick a set to see its binder: every card, what you own and what's missing.</p>
        <div className="open-hero">
          <a className="open-button" href={href.open()}>
            Open a pack
          </a>
          <p className="muted">
            {sets ? `Drawn at random from ${drawable} sets${has("eraFilter") ? ` (${eraNote})` : ""}.` : "Loading sets…"}{" "}
            {has("eraFilter") && <a href={href.settings()}>Change eras</a>}
          </p>
        </div>
        <div className="filters">
          <input type="search" placeholder="Search sets" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search sets" />
          {anyHidden && <label>
            <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> Show sets packs never come from
          </label>}
        </div>
      </header>

      {error && <p className="error">Couldn't load sets. {error}</p>}
      {!sets && !error && <p className="muted" role="status">Loading sets…</p>}
      {sets && shown === 0 && <p className="muted">No sets match “{query}”.</p>}

      {groups.map((g) => (
        <section key={g.serie.id} aria-labelledby={`serie-${g.serie.id}`}>
          <h2 id={`serie-${g.serie.id}`}>
            {g.serie.name} <span>{g.latest.slice(0, 4)}</span>
          </h2>
          <ul className="sets">
            {g.sets.map((s) => (
              <li key={s.id}>
                {s.hidden ? (
                  <div className="set-tile hidden" title={s.hidden}>
                    <SetTileBody set={s} note={s.hidden} />
                  </div>
                ) : (
                  <a className="set-tile" href={href.binder(s.id)}>
                    <SetTileBody set={s} tally={tallies.get(s.id)} />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <footer>
        Card data and images from <a href={gameCards.credit.url}>{gameCards.credit.name}</a>. {gameCards.credit.debugSet && <><a href={href.debug(gameCards.credit.debugSet)}>Debug page</a> · </>}<a href={href.foil()}>Foil lab</a>
      </footer>
    </main>
  );
}

function SetTileBody({ set, note, tally }: { set: SetSummary; note?: string; tally?: SetTally }) {
  return (
    <>
      <div className="logo">
        <gameCards.SetMark set={set} loading="lazy" fallback={<span className="logo-text">{set.name}</span>} />
      </div>
      <div className="meta">
        <strong>{set.name}</strong>
        <span>
          {formatDate(set.releaseDate)}
          {set.cardCount.official ? ` · ${set.cardCount.official} cards` : ""}
        </span>
        {note && <em>{note}</em>}
        {!note && has("setTiers") && setTier(set.id) !== "common" && (
          <span className="tier-chip" data-set-tier={setTier(set.id)}>
            {tierInfo(setTier(set.id)).name}
          </span>
        )}
        {tally && (
          <span className="owned-chip">
            {tally.mainOwned} / {set.cardCount.official} collected
          </span>
        )}
      </div>
    </>
  );
}
