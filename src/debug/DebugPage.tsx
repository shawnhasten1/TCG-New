// Phase 1/2 debug page: a set's rarity buckets, a REST-filter check, and test pack opens.

import { useEffect, useMemo, useState } from "react";
import { cardImage, probeRestFilter } from "../api/tcgdex";
import type { SetBrief, SetData } from "../api/types";
import { client } from "../app/client";
import { href } from "../app/router";
import { preparePack, openPack } from "../engine/openPack";
import { profileFor } from "../engine/profiles";
import { createRng } from "../engine/rng";
import type { PulledCard } from "../engine/types";

type Probe = Awaited<ReturnType<typeof probeRestFilter>>;

export function DebugPage({ initialSetId }: { initialSetId?: string }) {
  const [sets, setSets] = useState<SetBrief[]>([]);
  const [setId, setSetId] = useState(initialSetId ?? "sv03.5");
  const [data, setData] = useState<SetData>();
  const [progress, setProgress] = useState<[number, number]>();
  const [error, setError] = useState<string>();
  const [probe, setProbe] = useState<Probe>();
  const [seed, setSeed] = useState("debug");
  const [pack, setPack] = useState<PulledCard[]>();

  useEffect(() => {
    client.listSets().then(setSets, (e) => setError(String(e)));
  }, []);

  useEffect(() => {
    let live = true;
    setData(undefined);
    setProbe(undefined);
    setPack(undefined);
    setError(undefined);
    setProgress(undefined);
    history.replaceState(null, "", href.debug(setId));
    client
      .getSetCards(setId, (done, total) => live && setProgress([done, total]))
      .then((d) => live && setData(d), (e) => live && setError(String(e)));
    return () => {
      live = false;
    };
  }, [setId]);

  const profile = data && profileFor(data.set);
  const prep = useMemo(() => data && profile && preparePack(data, profile), [data, profile]);

  const open = () => {
    if (!data || !profile) return;
    try {
      setPack(openPack(data, profile, createRng(seed)));
      setError(undefined);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <main className="debug">
      <header>
        <h1>Data layer debug</h1>
        <a href={href.picker()}>← Sets</a>
        <label>
          Set{" "}
          <select value={setId} onChange={(e) => setSetId(e.target.value)}>
            {!sets.some((s) => s.id === setId) && <option value={setId}>{setId}</option>}
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.id})
              </option>
            ))}
          </select>
        </label>
      </header>

      {error && <p className="error">{error}</p>}
      {!data && !error && <p className="muted">Loading{progress ? ` ${progress[0]}/${progress[1]} cards` : "…"}</p>}

      {data && (
        <>
          <section className="summary">
            {data.set.logo && <img className="logo" src={`${data.set.logo}.webp`} alt="" />}
            <dl>
              <dt>Serie</dt>
              <dd>{data.set.serie.name}</dd>
              <dt>Released</dt>
              <dd>{data.set.releaseDate ?? "?"}</dd>
              <dt>Cards</dt>
              <dd>
                {data.cards.length} loaded / {data.set.cardCount.total} total ({data.set.cardCount.official} official)
              </dd>
              <dt>Source</dt>
              <dd>{data.source}</dd>
              <dt>No image</dt>
              <dd>{data.cards.filter((c) => !c.image).length}</dd>
              <dt>Boosters</dt>
              <dd>{data.set.boosters?.length ? data.set.boosters.map((b) => b.name).join(", ") : "none (generic wrapper)"}</dd>
              <dt>Profile</dt>
              <dd>{profile ? `${profile.name} (${profile.id})` : "none: not openable"}</dd>
            </dl>
          </section>

          {prep && (prep.variantDataMissing || prep.unusedRarities.length > 0 || prep.emptySlots.length > 0 || prep.excludedEnergy > 0) && (
            <ul className="warnings">
              {prep.excludedEnergy > 0 && <li>{prep.excludedEnergy} basic energies are kept out of packs.</li>}
              {prep.variantDataMissing && <li>No variant data in this set. Finishes come from profile odds.</li>}
              {prep.unusedRarities.length > 0 && <li>Rarities no slot can produce: {prep.unusedRarities.join(", ")}</li>}
              {prep.emptySlots.length > 0 && <li>Can't fill slot(s): {prep.emptySlots.join(", ")}</li>}
            </ul>
          )}

          <section>
            <h2>
              Rarity buckets{" "}
              <button onClick={() => probeRestFilter(data).then(setProbe)} disabled={!!probe}>
                Check REST set.id filter
              </button>
            </h2>
            <table>
              <thead>
                <tr>
                  <th>Rarity</th>
                  <th>Cards</th>
                  <th>Pokémon</th>
                  <th>Trainer</th>
                  <th>Energy</th>
                  <th>Normal</th>
                  <th>Holo</th>
                  <th>Reverse</th>
                  <th>1st Ed</th>
                  {probe && <th>REST filter</th>}
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.byRarity).map(([rarity, cards]) => {
                  const p = probe?.find((r) => r.rarity === rarity);
                  return (
                    <tr key={rarity}>
                      <td>{rarity}</td>
                      <td>{cards.length}</td>
                      <td>{cards.filter((c) => c.category === "Pokemon").length}</td>
                      <td>{cards.filter((c) => c.category === "Trainer").length}</td>
                      <td>{cards.filter((c) => c.category === "Energy").length}</td>
                      <td>{cards.filter((c) => c.variants.normal).length}</td>
                      <td>{cards.filter((c) => c.variants.holo).length}</td>
                      <td>{cards.filter((c) => c.variants.reverse).length}</td>
                      <td>{cards.filter((c) => c.variants.firstEdition).length}</td>
                      {probe && <td className={p?.rest === p?.expected ? "ok" : "bad"}>{p?.rest === -1 ? "error" : p?.rest}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {profile && prep && !prep.emptySlots.length && (
            <section>
              <h2>
                Test pack{" "}
                <input value={seed} onChange={(e) => setSeed(e.target.value)} aria-label="Seed" />{" "}
                <button onClick={open}>Open</button>{" "}
                <button onClick={() => setSeed(Math.random().toString(36).slice(2, 8))}>New seed</button>
              </h2>
              {pack && (
                <ol className="pack">
                  {pack.map((p, i) => (
                    <li key={i} className={`finish-${p.finish}`}>
                      <img src={cardImage(p.card, "low")} alt={p.card.name} loading="lazy" />
                      <span>
                        {p.card.name}
                        <small>
                          {p.card.rarity} · {p.finish}
                          {p.firstEdition ? " · 1st Ed" : ""}
                        </small>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
