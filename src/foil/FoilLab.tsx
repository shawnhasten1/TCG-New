// Phase 5 dev page (#/foil): every era mask and finish side by side, for tuning.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { href } from "../app/router";
import type { Finish } from "../engine/types";
import { Tilt } from "../opener/tilt";
import { FoilCard } from "./FoilCard";
import { layoutFor, layouts, type HoloPattern } from "./layouts";
import type { CardCategory } from "../api/types";
import { typeSymbol } from "./reverse";
import { artWindow, cardKind, type CardKind } from "./artWindows";
import { foilStyle, foilTint, foilTreatment, type Treatment } from "./treatment";
import "./foil-lab.css";

const img = (path: string) => `https://assets.tcgdex.net/en/${path}`;

/** Holo patterns to try on the era masks' Holo column. "Era-accurate" is what real cards use (layouts.ts holo). */
const HOLO_TRIES: { id: "era" | HoloPattern; label: string }[] = [
  { id: "era", label: "Era-accurate (live)" },
  { id: "smooth", label: "Smooth rainbow" },
  { id: "cosmos", label: "Cosmos" },
  { id: "cracked", label: "Cracked ice" },
  { id: "starlight", label: "Starlight" },
  { id: "sheen", label: "Sheen" },
  { id: "tinsel", label: "Tinsel" },
  { id: "waterweb", label: "Water web" },
];
type HoloTry = (typeof HOLO_TRIES)[number]["id"];
interface Sample {
  id: string;
  image: string;
  rarity: string;
  serie: string;
  category?: CardCategory;
  trainerType?: string;
  types?: string[];
}

/** Real full-art / ultra / hyper cards for the full-card treatments, then one card per rarity style. */
const FULL_CARD_SAMPLES: Sample[] = [
  { id: "sv03.5-151", image: img("sv/sv03.5/151"), rarity: "Double rare", serie: "sv" },
  { id: "sv03.5-181", image: img("sv/sv03.5/181"), rarity: "Illustration rare", serie: "sv" },
  { id: "sv03.5-199", image: img("sv/sv03.5/199"), rarity: "Special illustration rare", serie: "sv" },
  { id: "sv03.5-183", image: img("sv/sv03.5/183"), rarity: "Ultra Rare", serie: "sv" },
  { id: "sv08.5-179", image: img("sv/sv08.5/179"), rarity: "Hyper rare", serie: "sv" },
  { id: "swsh7-117", image: img("swsh/swsh7/117"), rarity: "Holo Rare V", serie: "swsh" },
  { id: "swsh7-111", image: img("swsh/swsh7/111"), rarity: "Holo Rare VMAX", serie: "swsh" },
  { id: "swsh7-202", image: img("swsh/swsh7/202"), rarity: "Ultra Rare", serie: "swsh" },
  { id: "swsh7-217", image: img("swsh/swsh7/217"), rarity: "Secret Rare", serie: "swsh", category: "Pokemon" },
  { id: "sm12-270", image: img("sm/sm12/270"), rarity: "Secret Rare", serie: "sm", category: "Trainer", trainerType: "Item" },
];

const STYLE_SAMPLES: Sample[] = [
  { id: "svp-001", image: img("sv/svp/001"), rarity: "Promo", serie: "sv", category: "Pokemon" },
  { id: "swsh10.5-011", image: img("swsh/swsh10.5/011"), rarity: "Radiant Rare", serie: "swsh", category: "Pokemon" },
  { id: "swsh4-9", image: img("swsh/swsh4/9"), rarity: "Amazing Rare", serie: "swsh", category: "Pokemon" },
  { id: "sv04.5-095", image: img("sv/sv04.5/095"), rarity: "Shiny rare", serie: "sv", category: "Pokemon" },
  { id: "sv04.5-216", image: img("sv/sv04.5/216"), rarity: "Shiny Ultra Rare", serie: "sv", category: "Pokemon" },
  { id: "swsh9-018", image: img("swsh/swsh9/018"), rarity: "Holo Rare VSTAR", serie: "swsh", category: "Pokemon" },
  { id: "sv06.5-058", image: img("sv/sv06.5/058"), rarity: "ACE SPEC Rare", serie: "sv", category: "Trainer", trainerType: "Item" },
];

/** Reverse holos: each era's foil pattern, with a spread of types (the symbol in the foil follows the type). */
const poke = (id: string, path: string, type: string, serie: string): Sample => ({ id, image: img(path), rarity: "Common", serie, category: "Pokemon", types: [type] });
const trainer = (id: string, path: string, serie: string, trainerType = "Item"): Sample => ({ id, image: img(path), rarity: "Uncommon", serie, category: "Trainer", trainerType });
const REVERSE_GROUPS: { title: string; note: string; samples: Sample[] }[] = [
  {
    title: "Sword & Shield",
    note: "Columns of chevron tiles with the type symbol; Poké Balls on Trainers.",
    samples: [
      poke("swsh12-049", "swsh/swsh12/049", "Lightning", "swsh"),
      poke("swsh12-017", "swsh/swsh12/017", "Fire", "swsh"),
      poke("swsh12-001", "swsh/swsh12/001", "Grass", "swsh"),
      poke("swsh12-036", "swsh/swsh12/036", "Water", "swsh"),
      poke("swsh12-060", "swsh/swsh12/060", "Psychic", "swsh"),
      poke("swsh12-091", "swsh/swsh12/091", "Fighting", "swsh"),
      poke("swsh7-93", "swsh/swsh7/93", "Darkness", "swsh"),
      poke("swsh12-127", "swsh/swsh12/127", "Metal", "swsh"),
      poke("swsh9-120", "swsh/swsh9/120", "Colorless", "swsh"),
      trainer("swsh9-150", "swsh/swsh9/150", "swsh"),
    ],
  },
  {
    title: "Scarlet & Violet",
    note: "Cobblestone tiles with type symbols of different sizes.",
    samples: [
      poke("sv01-063", "sv/sv01/063", "Lightning", "sv"),
      poke("sv01-030", "sv/sv01/030", "Fire", "sv"),
      poke("sv01-001", "sv/sv01/001", "Grass", "sv"),
      poke("sv01-042", "sv/sv01/042", "Water", "sv"),
      poke("sv01-082", "sv/sv01/082", "Psychic", "sv"),
      trainer("sv01-196", "sv/sv01/196", "sv"),
    ],
  },
  {
    title: "XY",
    note: "Small type symbols repeated across the background.",
    samples: [
      poke("xy7-13", "xy/xy7/13", "Fire", "xy"),
      poke("xy7-19", "xy/xy7/19", "Water", "xy"),
      poke("xy7-52", "xy/xy7/52", "Fairy", "xy"),
      poke("xy7-57", "xy/xy7/57", "Dragon", "xy"),
      trainer("xy7-69", "xy/xy7/69", "xy", "Supporter"),
    ],
  },
  {
    title: "Sun & Moon",
    note: "One large type symbol on the left side.",
    samples: [
      poke("sm3-18", "sm/sm3/18", "Fire", "sm"),
      poke("sm3-27", "sm/sm3/27", "Water", "sm"),
      poke("sm3-40", "sm/sm3/40", "Lightning", "sm"),
      poke("sm3-48", "sm/sm3/48", "Psychic", "sm"),
    ],
  },
  {
    title: "Plain eras and Legendary Collection",
    note: "EX, DP–BW and Mega Evolution have a plain foil background; Legendary Collection has fireworks.",
    samples: [
      poke("ex1-7", "ex/ex1/7", "Psychic", "ex"),
      poke("dp1-5", "dp/dp1/5", "Fire", "dp"),
      poke("me01-019", "me/me01/019", "Fire", "me"),
      poke("lc-3", "lc/lc/3", "Fire", "lc"),
    ],
  },
];

/** Art window fit (lab only): a Basic, a Stage and a Trainer from each era, to check the fitted masks. */
const FIT_SAMPLES: Record<string, Record<CardKind, string>> = {
  wotc: { basic: "base/base1/3", stage: "base/base1/1", trainer: "base/base1/70" },
  ecard: { basic: "ecard/ecard1/19", stage: "ecard/ecard1/1", trainer: "ecard/ecard1/137" },
  ex: { basic: "ex/ex1/18", stage: "ex/ex1/1", trainer: "ex/ex1/80" },
  dp: { basic: "dp/dp1/1", stage: "dp/dp1/2", trainer: "dp/dp1/105" },
  hgss: { basic: "hgss/hgss1/5", stage: "hgss/hgss1/1", trainer: "hgss/hgss1/89" },
  bw: { basic: "bw/bw1/1", stage: "bw/bw1/3", trainer: "bw/bw1/92" },
  xy: { basic: "xy/xy1/3", stage: "xy/xy1/4", trainer: "xy/xy1/116" },
  sm: { basic: "sm/sm1/1", stage: "sm/sm1/2", trainer: "sm/sm1/120" },
  swsh: { basic: "swsh/swsh1/2", stage: "swsh/swsh1/4", trainer: "swsh/swsh1/157" },
  sv: { basic: "sv/sv01/001", stage: "sv/sv01/004", trainer: "sv/sv01/166" },
  me: { basic: "me/me01/001", stage: "me/me01/002", trainer: "me/me01/113" },
};
const KINDS: CardKind[] = ["basic", "stage", "trainer"];
/** A TCGdex stage for each kind, so lab cards pick their window the way real cards do. */
const KIND_STAGE: Record<CardKind, string | undefined> = { basic: "Basic", stage: "Stage1", trainer: undefined };

const ERA_COLUMNS: { label: string; finish: Finish; treatment: Treatment }[] = [
  { label: "Normal", finish: "normal", treatment: "none" },
  { label: "Holo (art box)", finish: "holo", treatment: "holo" },
  { label: "Reverse (inverse)", finish: "reverse", treatment: "reverse" },
];

export function FoilLab() {
  const reduced = useMemo(() => matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const tilt = useMemo(() => new Tilt(reduced), [reduced]);
  const rootRef = useRef<HTMLElement>(null);
  const [showArtBox, setShowArtBox] = useState(false);
  const [sweep, setSweep] = useState(false);
  const [foilK, setFoilK] = useState(1);
  const [glitterK, setGlitterK] = useState(1);
  const [cardWidth, setCardWidth] = useState(220);
  const [holoTry, setHoloTry] = useState<HoloTry>("era");
  const [glow, setGlow] = useState(0.45);

  useEffect(() => {
    if (sweep) return;
    tilt.start();
    return () => tilt.stop();
  }, [tilt, sweep]);

  // Auto sweep: moves a light across every card so all finishes can be compared at once.
  useEffect(() => {
    if (!sweep) return;
    let raf = 0;
    const t0 = performance.now();
    const cards = () => rootRef.current?.querySelectorAll<HTMLElement>(".tcg-card") ?? [];
    const loop = (now: number) => {
      const t = (now - t0) / 1000;
      const px = 50 + 42 * Math.sin(t * 0.9);
      const py = 50 + 30 * Math.cos(t * 0.6);
      for (const el of cards()) {
        el.style.setProperty("--px", px.toFixed(2));
        el.style.setProperty("--py", py.toFixed(2));
        el.style.setProperty("--o", "1");
        el.style.setProperty("--ry", ((px - 50) / 50 * 10).toFixed(2) + "deg");
        el.style.setProperty("--rx", ((50 - py) / 50 * 10).toFixed(2) + "deg");
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      for (const el of cards()) for (const k of ["--px", "--py", "--o", "--rx", "--ry"]) el.style.removeProperty(k);
    };
  }, [sweep]);

  const onMove = (e: PointerEvent<HTMLElement>) => {
    if (sweep) return;
    const card = (e.target as HTMLElement).closest<HTMLElement>(".tcg-card");
    if (!card) return;
    if (tilt.active !== card) tilt.setActive(card, 14);
    tilt.aim(e.clientX, e.clientY);
  };

  const vars = { "--foil-k": foilK, "--glitter-k": glitterK, "--glow": glow, "--lab-cw": `${cardWidth}px` } as CSSProperties;

  return (
    <main className="foil-lab" ref={rootRef} style={vars} onPointerMove={onMove} onPointerLeave={() => tilt.rest()}>
      <header>
        <a href={href.open()}>← Open packs</a>
        <h1>Foil lab</h1>
        <p>Hover a card to tilt it, or turn on the light sweep to compare everything at once. Art boxes are % of the card image, set in <code>src/foil/layouts.ts</code>.</p>
        <div className="controls">
          <label>
            <input type="checkbox" checked={showArtBox} onChange={(e) => setShowArtBox(e.target.checked)} /> Show art box and border
          </label>
          <label>
            <input type="checkbox" checked={sweep} onChange={(e) => setSweep(e.target.checked)} /> Light sweep
          </label>
          <label>
            Foil strength <input type="range" min="0" max="2.5" step="0.05" value={foilK} onChange={(e) => setFoilK(+e.target.value)} /> <output>{foilK.toFixed(2)}</output>
          </label>
          <label>
            Glitter strength <input type="range" min="0" max="2.5" step="0.05" value={glitterK} onChange={(e) => setGlitterK(+e.target.value)} /> <output>{glitterK.toFixed(2)}</output>
          </label>
          <label>
            Holo pattern{" "}
            <select value={holoTry} onChange={(e) => setHoloTry(e.target.value as HoloTry)}>
              {HOLO_TRIES.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Pointer glow <input type="range" min="0" max="1" step="0.05" value={glow} onChange={(e) => setGlow(+e.target.value)} /> <output>{Math.round(glow * 100)}%</output>
          </label>
          <label>
            Card size <input type="range" min="140" max="360" step="10" value={cardWidth} onChange={(e) => setCardWidth(+e.target.value)} />
          </label>
        </div>
        {(foilK !== 1 || glitterK !== 1) && (
          <p className="readout">
            Multiply the <code>--o * …</code> factors in <code>foil.css</code> by foil ×{foilK.toFixed(2)}, glitter ×{glitterK.toFixed(2)} to keep these settings.
          </p>
        )}
      </header>

      <section>
        <h2>Era masks</h2>
        <div className="era-grid">
          <div className="col-head" />
          {ERA_COLUMNS.map((c) => (
            <div key={c.label} className="col-head">
              {c.label}
            </div>
          ))}
          {layouts.map((l) => (
            <EraRow key={l.id} layoutId={l.id} showArtBox={showArtBox} holoTry={holoTry} />
          ))}
        </div>
      </section>

      <section>
        <h2>Full-card treatments</h2>
        <div className="full-grid">{FULL_CARD_SAMPLES.map((s) => sampleFigure(s, showArtBox))}</div>
      </section>

      <section>
        <h2>Rarity styles</h2>
        <div className="full-grid">{STYLE_SAMPLES.map((s) => sampleFigure(s, showArtBox))}</div>
      </section>

      <section>
        <h2>Art window fit</h2>
        <p className="muted">
          A Basic, a Stage and a Trainer from each era, holo and reverse. Each kind has its own art window (artWindows.ts),
          cutting around the evolution portrait and labels. Turn on "Show art box" to see them.
        </p>
        <div className="fit-grid">
          <div className="col-head" />
          {KINDS.flatMap((k) => [`${k} · holo`, `${k} · reverse`]).map((h) => (
            <div key={h} className="col-head">
              {h}
            </div>
          ))}
          {layouts.map((l) => (
            <FitRow key={l.id} layoutId={l.id} showArtBox={showArtBox} />
          ))}
        </div>
      </section>

      <section>
        <h2>Reverse holos</h2>
        {REVERSE_GROUPS.map((g) => (
          <div key={g.title} className="rev-group">
            <h3>{g.title}</h3>
            <p className="muted">{g.note}</p>
            <div className="full-grid">{g.samples.map((s) => sampleFigure(s, showArtBox, "reverse"))}</div>
          </div>
        ))}
      </section>
    </main>
  );
}

function EraRow({ layoutId, showArtBox, holoTry }: { layoutId: string; showArtBox: boolean; holoTry: HoloTry }) {
  const layout = layouts.find((l) => l.id === layoutId)!;
  const art = artWindow(layout, cardKind("Pokemon", layout.sample.stage)).art;
  const holo = holoTry === "era" ? layout.holo : holoTry;
  return (
    <>
      <div className="row-head">
        <strong>{layout.name}</strong>
        <small>
          {layout.sample.name} ({layout.sample.stage}) · art {art.x0}–{art.x1}% × {art.y0}–{art.y1}%
        </small>
        <small>Holo: {HOLO_TRIES.find((h) => h.id === holo)?.label}</small>
      </div>
      {ERA_COLUMNS.map((c) => (
        <div key={c.label} className="lab-card">
          <FoilCard holoPattern={holoTry === "era" ? undefined : holoTry} image={layout.sample.image} rarity={layout.sample.rarity} category="Pokemon" stage={layout.sample.stage} types={layout.sample.types} finish={c.finish} treatment={c.treatment} layout={layout} showArtBox={showArtBox} />
        </div>
      ))}
    </>
  );
}

function FitRow({ layoutId, showArtBox }: { layoutId: string; showArtBox: boolean }) {
  const layout = layouts.find((l) => l.id === layoutId)!;
  const paths = FIT_SAMPLES[layout.id];
  if (!paths) return null;
  return (
    <>
      <div className="row-head">
        <strong>{layout.name}</strong>
      </div>
      {KINDS.flatMap((kind) => {
        const category = kind === "trainer" ? "Trainer" : "Pokemon";
        return (["holo", "reverse"] as Finish[]).map((finish) => (
          <div key={kind + finish} className="lab-card">
            <FoilCard image={img(paths[kind])} rarity="Rare" category={category} stage={KIND_STAGE[kind]} finish={finish} layout={layout} showArtBox={showArtBox} />
          </div>
        ));
      })}
    </>
  );
}

function sampleFigure(s: Sample, showArtBox: boolean, finish: Finish = "holo") {
  const kind = { category: s.category, trainerType: s.trainerType };
  const layout = layoutFor(s.serie);
  const label =
    finish === "reverse"
      ? `${layout.reverse} · ${typeSymbol(s.category, s.types)}`
      : [foilTreatment("holo", s.rarity), foilStyle("holo", s.rarity, kind), foilTint(s.rarity, kind) === "gold" && "gold"].filter(Boolean).join(" · ");
  return (
    <figure key={s.id}>
      <div className="lab-card">
        <FoilCard image={s.image} rarity={s.rarity} category={s.category} trainerType={s.trainerType} types={s.types} finish={finish} layout={layout} showArtBox={showArtBox} />
      </div>
      <figcaption>
        {finish === "reverse" ? (s.types?.[0] ?? s.trainerType ?? s.category) : s.rarity}
        <small>
          {s.id} · {label}
        </small>
      </figcaption>
    </figure>
  );
}
