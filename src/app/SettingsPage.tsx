// Settings: sound, daily pack limit, collection backup and reset.

import { useEffect, useRef, useState } from "react";
import { parseBackup, planMerge, toBackup } from "../collection/backup";
import { localDay, packAllowance, packsOpenedOn, RECHARGE_MS } from "../collection/daily";
import { addPulls, clearPulls, getPulls, onCollectionChange, type PullRecord } from "../collection/store";
import { ERAS } from "../engine/randomSet";
import "../collection/collection.css";
import { href } from "./router";
import { updateSettings, useSettings } from "./settings";
import { sfx } from "./sound";

const LIMITS = [1, 3, 5, 10, 0];
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SettingsPage() {
  const settings = useSettings();
  const [pulls, setPulls] = useState<PullRecord[]>();
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string }>();
  const fileRef = useRef<HTMLInputElement>(null);

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

  const packs = new Set(pulls?.map((p) => p.packId)).size;

  // An empty list means every era, so all boxes show ticked; at least one always stays ticked.
  const eraOn = (id: string) => !settings.eras.length || settings.eras.includes(id);
  const toggleEra = (id: string, on: boolean) => {
    const current = ERAS.map((e) => e.id).filter(eraOn);
    const next = on ? [...current, id] : current.filter((e) => e !== id);
    if (!next.length) return;
    updateSettings({ eras: next.length === ERAS.length ? [] : next });
  };
  const today = pulls ? packsOpenedOn(pulls, localDay(new Date())) : 0;

  const exportCollection = () => {
    if (!pulls) return;
    download(`pack-opener-collection-${localDay(new Date())}.json`, JSON.stringify(toBackup(pulls), null, 1));
    setMessage({ kind: "ok", text: `Exported ${plural(pulls.length, "card")} from ${plural(packs, "pack")}.` });
  };

  const importCollection = async (file: File) => {
    try {
      const incoming = parseBackup(await file.text());
      if (mode === "replace") {
        if (!confirm(`Replace your collection (${pulls?.length ?? 0} cards) with the ${incoming.length} cards in this file?`)) return;
        await clearPulls();
        await addPulls(incoming);
        setMessage({ kind: "ok", text: `Replaced your collection with ${incoming.length} cards.` });
      } else {
        const plan = planMerge(await getPulls(), incoming);
        await addPulls(plan.toAdd);
        const skipped = plan.packsSkipped ? ` Skipped ${plural(plan.packsSkipped, "pack")} you already had.` : "";
        setMessage({
          kind: "ok",
          text: plan.toAdd.length ? `Added ${plural(plan.toAdd.length, "card")} from ${plural(plan.packsAdded, "pack")}.${skipped}` : `Nothing new to add.${skipped}`,
        });
      }
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const resetAll = async () => {
    if (confirm(`Delete your whole collection (${plural(pulls?.length ?? 0, "card")} from ${plural(packs, "pack")})? Export it first if you might want it back.`)) {
      await clearPulls();
      setMessage({ kind: "ok", text: "Collection cleared." });
    }
  };

  return (
    <main className="collection settings">
      <nav className="crumbs">
        <a href={href.open()}>← Open packs</a>
        <a href={href.collection()}>Your collection</a>
      </nav>
      <h1>Settings</h1>

      <section>
        <h2>Sound</h2>
        <label className="row">
          <input type="checkbox" checked={settings.sound} onChange={(e) => updateSettings({ sound: e.target.checked })} /> Play sound effects
        </label>
        <label className="row">
          Volume
          <input type="range" min="0" max="1" step="0.05" value={settings.volume} disabled={!settings.sound} onChange={(e) => updateSettings({ volume: +e.target.value })} />
          <button type="button" disabled={!settings.sound} onClick={() => (sfx.tear(), setTimeout(() => sfx.hit(3), 500))}>
            Test
          </button>
        </label>
      </section>

      <section>
        <h2>Pack of the day</h2>
        <p className="muted">How many packs you can open at once, across all sets. Once they run out, a pack recharges every {RECHARGE_MS / 60_000} minutes, up to the limit. Everything refills at midnight.</p>
        <div role="radiogroup" aria-label="Daily pack limit" className="segmented">
          {LIMITS.map((n) => (
            <button key={n} type="button" role="radio" aria-checked={settings.dailyLimit === n} aria-pressed={settings.dailyLimit === n} onClick={() => updateSettings({ dailyLimit: n })}>
              {n === 0 ? "Unlimited" : plural(n, "pack")}
            </button>
          ))}
        </div>
        <p className="muted">
          {plural(today, "pack")} opened today{settings.dailyLimit > 0 && pulls ? ` · ${plural(packAllowance(pulls, settings.dailyLimit, new Date()).left, "pack")} ready now` : ""}.
        </p>
      </section>

      <section>
        <h2>Sets packs come from</h2>
        <p className="muted">Every pack is drawn from a random set. Narrow the draw to the eras you like; at least one stays on.</p>
        <fieldset className="eras">
          <legend className="sr-only">Eras</legend>
          {ERAS.map((e) => (
            <label key={e.id}>
              <input type="checkbox" checked={eraOn(e.id)} disabled={eraOn(e.id) && ERAS.filter((x) => eraOn(x.id)).length === 1} onChange={(ev) => toggleEra(e.id, ev.target.checked)} /> {e.name}
            </label>
          ))}
        </fieldset>
      </section>

      <section>
        <h2>Backup</h2>
        <p className="muted">
          Your collection is stored in this browser only ({pulls ? `${plural(pulls.length, "card")} from ${plural(packs, "pack")}` : "loading…"}). Export it to keep a copy or move it to another device.
        </p>
        <div className="row">
          <button type="button" onClick={exportCollection} disabled={!pulls?.length}>
            Export collection
          </button>
        </div>
        <fieldset className="row">
          <legend className="muted">Import</legend>
          <label>
            <input type="radio" name="mode" checked={mode === "merge"} onChange={() => setMode("merge")} /> Merge with my collection
          </label>
          <label>
            <input type="radio" name="mode" checked={mode === "replace"} onChange={() => setMode("replace")} /> Replace my collection
          </label>
        </fieldset>
        <div className="row">
          <input ref={fileRef} type="file" accept="application/json,.json" aria-label="Collection backup file" onChange={(e) => e.target.files?.[0] && importCollection(e.target.files[0])} />
        </div>
        {message && (
          <p className={message.kind === "error" ? "error" : "ok"} role="status">
            {message.text}
          </p>
        )}
      </section>

      <section>
        <h2>Reset</h2>
        <button type="button" className="danger" onClick={resetAll} disabled={!pulls?.length}>
          Delete my whole collection
        </button>
      </section>
    </main>
  );
}
