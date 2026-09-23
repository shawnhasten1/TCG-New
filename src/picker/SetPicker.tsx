// Phase 3: browse sets grouped by series, with logos and release dates.

import { useEffect, useMemo, useState } from "react";
import type { SetSummary } from "../api/types";
import { client, getUnopenable } from "../app/client";
import { href } from "../app/router";
import { tallyBySet, type SetTally } from "../collection/progress";
import { getPulls, onCollectionChange } from "../collection/store";
import { hiddenReason } from "../engine/openable";
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
    client.listSetSummaries().then(setSets, (e) => setError(String(e)));
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
      const hidden = hiddenReason(s) ?? unopenable[s.id];
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

  return (
    <main className="picker">
      <header>
        <div className="title-row">
          <h1>Pick a set</h1>
          <nav className="header-links">
            <a className="collection-link" href={href.collection()}>
              Your collection{tallies.size ? ` · ${[...tallies.values()].reduce((n, t) => n + t.pulls, 0)} cards` : ""}
            </a>
            <a className="collection-link" href={href.settings()}>
              Settings
            </a>
          </nav>
        </div>
        <p className="lede">Open booster packs from any Pokémon TCG expansion, using the real card list.</p>
        <div className="filters">
          <input type="search" placeholder="Search sets" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search sets" />
          <label>
            <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> Show sets that can't be opened
          </label>
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
                  <a className="set-tile" href={href.open(s.id)}>
                    <SetTileBody set={s} tally={tallies.get(s.id)} />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <footer>
        Card data and images from <a href="https://tcgdex.dev">TCGdex</a>. <a href={href.debug("sv03.5")}>Debug page</a> · <a href={href.foil()}>Foil lab</a>
      </footer>
    </main>
  );
}

function SetTileBody({ set, note, tally }: { set: SetSummary; note?: string; tally?: SetTally }) {
  const [logoFailed, setLogoFailed] = useState(false);
  return (
    <>
      <div className="logo">
        {set.logo && !logoFailed ? (
          <img src={`${set.logo}.webp`} alt="" loading="lazy" onError={() => setLogoFailed(true)} />
        ) : (
          <span className="logo-text">{set.name}</span>
        )}
      </div>
      <div className="meta">
        <strong>{set.name}</strong>
        <span>
          {formatDate(set.releaseDate)} · {set.cardCount.official} cards
        </span>
        {note && <em>{note}</em>}
        {tally && (
          <span className="owned-chip">
            {tally.mainOwned} / {set.cardCount.official} collected
          </span>
        )}
      </div>
    </>
  );
}
