// Settings: account, appearance, sound, the pack allowance, collection export and reset.

import { useEffect, useState } from "react";
import { AccountSection } from "../account/AccountSection";
import { isMember, useAccount } from "../account/account";
import { toBackup } from "../collection/backup";
import { localDay, packsOpenedOn } from "../collection/daily";
import { clearPulls, getPulls, onCollectionChange, type PullRecord } from "../collection/store";
import { ERAS } from "../engine/randomSet";
import { PACK_LIMIT, RECHARGE_MS } from "../packs/protocol";
import "../collection/collection.css";
import { href } from "./router";
import { type Theme, updateSettings, useSettings } from "./settings";
import { sfx } from "./sound";

const THEMES: { id: Theme; name: string }[] = [
  { id: "system", name: "Match device" },
  { id: "light", name: "Light" },
  { id: "dark", name: "Dark" },
];
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
  const account = useAccount();
  const signedIn = isMember(account);
  const [pulls, setPulls] = useState<PullRecord[]>();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string }>();

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

  const resetAll = async () => {
    if (confirm(`Delete your whole collection (${plural(pulls?.length ?? 0, "card")} from ${plural(packs, "pack")})${signedIn ? ", on every device you're signed in on" : ""}? Export it first to keep a record, but you can't bring it back from the file.`)) {
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

      <AccountSection />

      <section>
        <h2>Appearance</h2>
        <div role="radiogroup" aria-label="Theme" className="segmented">
          {THEMES.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={settings.theme === t.id} aria-pressed={settings.theme === t.id} onClick={() => updateSettings({ theme: t.id })}>
              {t.name}
            </button>
          ))}
        </div>
      </section>

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
        <h2>Motion</h2>
        <label className="row">
          <input type="checkbox" checked={settings.motion} onChange={(e) => updateSettings({ motion: e.target.checked })} /> Tilt cards by tilting your phone
        </label>
        <p className="muted">On iPhone, Safari asks for motion access the first time you tap a card or pack.</p>
      </section>

      <section>
        <h2>Packs</h2>
        <p className="muted">
          You can hold up to {PACK_LIMIT} packs, across all sets. Once you're below that, one comes back every {RECHARGE_MS / 60_000} minutes.
        </p>
        <p className="muted">{plural(today, "pack")} opened today.</p>
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
        <h2>Export</h2>
        <p className="muted">
          {signedIn ? "Your collection is saved to your account" : "As a guest, your collection belongs to this browser"} ({pulls ? `${plural(pulls.length, "card")} from ${plural(packs, "pack")}` : "loading…"}).{" "}
          {signedIn ? "Export it to keep a copy of your own." : "Sign up to keep it on every device, or export it to keep a copy."}
        </p>
        <div className="row">
          <button type="button" onClick={exportCollection} disabled={!pulls?.length}>
            Export collection
          </button>
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
