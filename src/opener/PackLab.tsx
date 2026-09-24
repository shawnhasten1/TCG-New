// Dev page (#/pack-lab): tries a photo of a real sealed pack in the real opener before any set wears one.
// Packs opened here are rolled locally and never saved.

import { useEffect, useState } from "react";
import type { SetBrief, SetData } from "../api/types";
import { client } from "../app/client";
import { openPack } from "../engine/openPack";
import { profileFor } from "../engine/profiles";
import { createRng } from "../engine/rng";
import type { PulledCard } from "../engine/types";
import { PackOpener } from "./PackOpener";
import manifest from "../packs/packArt.json";
import "./opener.css";
import "./pack-lab.css";

/** Every downloaded pack photo, with the set it belongs to. */
const SAMPLES = Object.entries(manifest).flatMap(([setId, arts]) => arts.map((a) => ({ name: `${setId} · ${a.name}`, src: a.src, setId })));

type Fit = "shape" | "crop";

export function PackLab() {
  const [sets, setSets] = useState<SetBrief[]>([]);
  const [src, setSrc] = useState(SAMPLES[0].src);
  const [setId, setSetId] = useState(SAMPLES[0].setId);
  const [fit, setFit] = useState<Fit>("shape");
  const [photoOn, setPhotoOn] = useState(true);
  const [aspect, setAspect] = useState<number>();
  const [data, setData] = useState<SetData>();
  const [pulls, setPulls] = useState<PulledCard[]>();
  const [round, setRound] = useState(0);
  const [error, setError] = useState<string>();

  useEffect(() => {
    client.listSets().then(setSets, (e) => setError(String(e)));
  }, []);

  // The photo's own shape, so the pack can take it.
  useEffect(() => {
    setAspect(undefined);
    const img = new Image();
    img.onload = () => setAspect(img.naturalWidth / img.naturalHeight);
    img.onerror = () => setError(`Couldn't load ${src}`);
    img.src = src;
  }, [src]);

  useEffect(() => {
    let live = true;
    setData(undefined);
    setError(undefined);
    client.getSetCards(setId).then((d) => live && setData(d), (e) => live && setError(String(e)));
    return () => {
      live = false;
    };
  }, [setId]);

  // A fresh pack whenever the set changes or "Open another pack" is pressed.
  useEffect(() => {
    setPulls(undefined);
    if (!data) return;
    const profile = profileFor(data.set);
    if (!profile) return setError(`${data.set.name} isn't openable.`);
    try {
      setPulls(openPack(data, profile, createRng(`pack-lab-${round}-${Date.now()}`)));
    } catch (e) {
      setError(String(e));
    }
  }, [data, round]);

  const pickFile = (file?: File) => {
    if (!file) return;
    if (src.startsWith("blob:")) URL.revokeObjectURL(src);
    setSrc(URL.createObjectURL(file));
  };

  const packPhoto = photoOn && aspect ? { src, aspect: fit === "shape" ? aspect : undefined } : undefined;

  return (
    <div className="pack-lab">
      <header>
        <h1>Pack lab</h1>
        <p>Tear a real pack photo open in the real opener. Nothing opened here goes into your collection.</p>
        <div className="lab-controls">
          <label>
            Photo{" "}
            <select value={SAMPLES.some((s) => s.src === src) ? src : ""} onChange={(e) => {
              const sample = SAMPLES.find((s) => s.src === e.target.value);
              if (!sample) return;
              setSrc(sample.src);
              setSetId(sample.setId);
            }}>
              {!SAMPLES.some((s) => s.src === src) && <option value="">Your file</option>}
              {SAMPLES.map((s) => (
                <option key={s.src} value={s.src}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Or try a file <input type="file" accept="image/*" onChange={(e) => pickFile(e.target.files?.[0])} />
          </label>
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
          <fieldset>
            <legend>Fit</legend>
            <label>
              <input type="radio" name="fit" checked={fit === "shape"} onChange={() => setFit("shape")} /> Pack takes the photo's shape
            </label>
            <label>
              <input type="radio" name="fit" checked={fit === "crop"} onChange={() => setFit("crop")} /> Photo cropped to today's pack shape
            </label>
          </fieldset>
          <label>
            <input type="checkbox" checked={!photoOn} onChange={(e) => setPhotoOn(!e.target.checked)} /> Compare: today's wrapper instead
          </label>
          {aspect && (
            <small>
              Photo is {aspect.toFixed(3)} wide per tall; today's pack is {(1.12 / 1.704).toFixed(3)}.
            </small>
          )}
        </div>
        {error && <p className="error">{error}</p>}
      </header>

      {data && pulls && (photoOn ? aspect : true) ? (
        <PackOpener
          key={`${round}|${src}|${fit}|${photoOn}`}
          set={data.set}
          pulls={pulls}
          packPhoto={packPhoto}
          onAgain={() => setRound((r) => r + 1)}
        />
      ) : (
        !error && <p className="loading-note">Loading…</p>
      )}
    </div>
  );
}
