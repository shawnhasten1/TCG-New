// Home: open a pack (always from a random set), and browse sets by series to view their binders.

import { useEffect, useMemo, useState } from "react";
import type { SetSummary } from "../api/types";
import { client, getUnopenable } from "../app/client";
import { href } from "../app/router";
import { tallyBySet, type SetTally } from "../collection/progress";
import { getPulls, onCollectionChange } from "../collection/store";
import { hiddenReason } from "../engine/openable";
import { useSettings } from "../app/settings";
import { ERAS, drawableSets } from "../engine/randomSet";
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
  const { eras } = useSettings();
  const drawable = sets ? drawableSets(sets, { unopenable, eras }).length : 0;
  const eraNote = eras.length ? ERAS.filter((e) => eras.includes(e.id)).map((e) => e.name).join(", ") : "every era";

  return (
    <main className="picker">
      <header>
        <div className="title-row">
          <h1>Pack Opener</h1>
          <nav className="header-links">
            <a className="collection-link" href={href.collection()}>
              Your collection{tallies.size ? ` · ${[...tallies.values()].reduce((n, t) => n + t.pulls, 0)} cards` : ""}
            </a>
            <a className="collection-link" href={href.settings()}>
              Settings
            </a>
          </nav>
        </div>
        <p className="lede">Open booster packs from a random Pokémon TCG expansion, using the real card list.</p>
        <div className="open-hero">
          <a className="open-button" href={href.open()}>
            Open a pack
          </a>
          <p className="muted">
            {sets ? `Drawn at random from ${drawable} sets (${eraNote}).` : "Loading sets…"}{" "}
            <a href={href.settings()}>Change eras</a>
          </p>
        </div>
        <h2 className="browse-title">Browse sets</h2>
        <p className="muted">Pick a set to see its binder: every card, what you own and what's missing.</p>
        <div className="filters">
          <input type="search" placeholder="Search sets" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search sets" />
          <label>
            <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> Show sets packs never come from
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
