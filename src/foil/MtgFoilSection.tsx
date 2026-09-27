// The foil lab's Magic section: real cards from each foil era (mtg/sets.ts foilEra), each era's first card also shown
// plain to compare, with other looks to try. Only shown where Magic is switched on (DEMO_GAMES), since its images come
// through the Worker's /api/mtg routes.

import { useState } from "react";
import { cardImageBase } from "../mtg/cards";
import type { MtgFoilEra } from "../mtg/sets";
import { FoilCard } from "./FoilCard";
import { MTG_LAYOUTS, type FrameLayout, type RarityFoil } from "./layouts";

interface MtgSample {
  set: string;
  name: string;
  rarity: string;
  /** Scryfall id. */
  id: string;
}

const ERAS: { era: MtgFoilEra; note: string; samples: MtgSample[] }[] = [
  {
    era: "premodern",
    note: "Urza's Legacy to Scourge. The frame shines and the art and text box stay dim, with the shooting star in the text box.",
    samples: [
      { set: "ODY", name: "Aegis of Honor", rarity: "Rare", id: "9561ffdb-f4dd-4b62-a2c2-933498e3a061" },
      { set: "ULG", name: "Angelic Curator", rarity: "Common", id: "c63ba2da-6dea-44ac-8439-527222da565b" },
      { set: "INV", name: "Alabaster Leech", rarity: "Rare", id: "c86b45d9-aba6-4c09-8605-037754ba7fd4" },
      { set: "ODY", name: "Scrivener", rarity: "Common", id: "606f16fb-0829-45f9-a12e-aeb2371dd533" },
      { set: "ONS", name: "Akroma's Blessing", rarity: "Uncommon", id: "c3710c68-3f71-4d76-8bd2-001f0e8036f5" },
    ],
  },
  {
    era: "modern",
    note: "Eighth Edition on. The whole face shines, art and text box included.",
    samples: [
      { set: "ELD", name: "The Great Henge", rarity: "Mythic Rare", id: "af915ed2-1f34-43f6-85f5-2430325b720f" },
      { set: "ELD", name: "Forest", rarity: "Basic Land", id: "e52fa771-eaff-48e0-8c23-d118dc4b3438" },
      { set: "MRD", name: "Chalice of the Void", rarity: "Rare", id: "1a02ca71-5e39-4a5f-aaba-a1e3e10a6a3e" },
      { set: "ISD", name: "Delver of Secrets", rarity: "Common", id: "11bf83bb-c95b-4b4f-9a56-ce7a1816307a" },
      { set: "DSK", name: "Acrobatic Cheerleader", rarity: "Common", id: "6f1a7590-3eee-4803-b192-d4fb771e6a86" },
      { set: "BLB", name: "Maha, Its Feathers Night", rarity: "Mythic Rare", id: "cf3320ec-c4e8-405a-982d-e009c58c9e21" },
    ],
  },
  {
    era: "dark",
    note: "Future Sight, Lorwyn and Shadowmoor's blocks: the same sheen, darker.",
    samples: [
      { set: "LRW", name: "Ajani Goldmane", rarity: "Rare", id: "2a1470a6-d09d-4a2a-84a6-d56e32ed237a" },
      { set: "LRW", name: "Skeletal Changeling", rarity: "Common", id: "6f1d8e26-304b-4571-9b33-7713265d9bbf" },
      { set: "SHM", name: "Apothecary Initiate", rarity: "Common", id: "9b6ae637-bdb7-4117-8539-e424159bad6f" },
    ],
  },
];

/** Looks to try on every era in place of its own (mtg/foil.ts). "Art box" ones use each era's art window (artWindows.ts). */
const LOOKS: { id: string; label: string; foil?: RarityFoil }[] = [
  { id: "era", label: "Era-accurate (live)" },
  { id: "traditional", label: "Plain traditional foil, every era", foil: { treatment: "traditional" } },
  { id: "textured", label: "Textured rainbow (the first try)", foil: { treatment: "etched", tint: "rainbow" } },
  { id: "etched-gold", label: "Whole card, gold", foil: { treatment: "etched", tint: "gold" } },
  { id: "smooth", label: "Art box, smooth rainbow", foil: { treatment: "holo", holo: "smooth" } },
  { id: "sheen", label: "Art box, sheen", foil: { treatment: "holo", holo: "sheen" } },
];

export function MtgFoilSection({ showArtBox }: { showArtBox: boolean }) {
  const [lookId, setLookId] = useState("era");
  const [printLine, setPrintLine] = useState(false);
  const look = LOOKS.find((l) => l.id === lookId)!;
  const layoutOf = (era: MtgFoilEra): FrameLayout => (look.foil ? { ...MTG_LAYOUTS[era], rarityFoil: () => look.foil } : MTG_LAYOUTS[era]);

  const figure = (s: MtgSample, era: MtgFoilEra, finish: "normal" | "holo") => (
    <figure key={`${s.id}-${finish}`}>
      <div className="lab-card">
        <FoilCard image={cardImageBase(s.id)} rarity={s.rarity} finish={finish} layout={layoutOf(era)} showArtBox={showArtBox} printLine={printLine && era === "premodern"} />
      </div>
      <figcaption>
        {s.name}
        <small>
          {s.set} · {s.rarity} · {finish === "holo" ? "foil" : "non-foil, to compare"}
        </small>
      </figcaption>
    </figure>
  );

  return (
    <section className="mtg-lab">
      <h2>Magic: The Gathering</h2>
      <p className="muted">
        A Magic foil is the whole card, whatever its rarity: packs have a foil slot rather than holo rares. How it looks
        depends on the set's foil era (<code>foilEra</code> in <code>src/mtg/sets.ts</code>); the looks are in{" "}
        <code>src/mtg/foil.ts</code> and <code>foil.css</code>.
      </p>
      <div className="controls">
        <label>
          Magic foil{" "}
          <select value={lookId} onChange={(e) => setLookId(e.target.value)}>
            {LOOKS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input type="checkbox" checked={printLine} onChange={(e) => setPrintLine(e.target.checked)} /> Print lines on 1999–2003 foils
        </label>
      </div>

      {ERAS.map(({ era, note, samples }) => (
        <div key={era} className="mtg-era">
          <h3>{MTG_LAYOUTS[era].name}</h3>
          <p className="muted">{note}</p>
          <div className="full-grid">
            {figure(samples[0], era, "normal")}
            {samples.map((s) => figure(s, era, "holo"))}
          </div>
        </div>
      ))}
    </section>
  );
}
