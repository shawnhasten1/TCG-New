// Phase 5 dev page (#/foil): every era mask and finish side by side, for tuning.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { href } from "../app/router";
import type { Finish } from "../engine/types";
import { Tilt } from "../opener/tilt";
import { FoilCard } from "./FoilCard";
import { layoutFor, layouts } from "./layouts";
import { foilTreatment, type Treatment } from "./treatment";
import "./foil-lab.css";

const img = (path: string) => `https://assets.tcgdex.net/en/${path}`;

/** Real full-art / ultra / hyper cards for the full-card treatments. */
const FULL_CARD_SAMPLES = [
  { id: "sv03.5-151", image: img("sv/sv03.5/151"), rarity: "Double rare", serie: "sv" },
  { id: "sv03.5-181", image: img("sv/sv03.5/181"), rarity: "Illustration rare", serie: "sv" },
  { id: "sv03.5-199", image: img("sv/sv03.5/199"), rarity: "Special illustration rare", serie: "sv" },
  { id: "sv03.5-183", image: img("sv/sv03.5/183"), rarity: "Ultra Rare", serie: "sv" },
  { id: "sv08.5-179", image: img("sv/sv08.5/179"), rarity: "Hyper rare", serie: "sv" },
  { id: "swsh7-117", image: img("swsh/swsh7/117"), rarity: "Holo Rare V", serie: "swsh" },
  { id: "swsh7-111", image: img("swsh/swsh7/111"), rarity: "Holo Rare VMAX", serie: "swsh" },
  { id: "swsh7-202", image: img("swsh/swsh7/202"), rarity: "Ultra Rare", serie: "swsh" },
  { id: "swsh7-217", image: img("swsh/swsh7/217"), rarity: "Secret Rare", serie: "swsh" },
  { id: "sm12-270", image: img("sm/sm12/270"), rarity: "Secret Rare", serie: "sm" },
];

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

  const vars = { "--foil-k": foilK, "--glitter-k": glitterK, "--lab-cw": `${cardWidth}px` } as CSSProperties;

  return (
    <main className="foil-lab" ref={rootRef} style={vars} onPointerMove={onMove} onPointerLeave={() => tilt.rest()}>
      <header>
        <a href={href.picker()}>← Sets</a>
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
            <EraRow key={l.id} layoutId={l.id} showArtBox={showArtBox} />
          ))}
        </div>
      </section>

      <section>
        <h2>Full-card treatments</h2>
        <div className="full-grid">
          {FULL_CARD_SAMPLES.map((s) => (
            <figure key={s.id}>
              <div className="lab-card">
                <FoilCard image={s.image} rarity={s.rarity} finish="holo" layout={layoutFor(s.serie)} showArtBox={showArtBox} />
              </div>
              <figcaption>
                {s.rarity}
                <small>
                  {s.id} · {foilTreatment("holo", s.rarity)}
                </small>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
    </main>
  );
}

function EraRow({ layoutId, showArtBox }: { layoutId: string; showArtBox: boolean }) {
  const layout = layouts.find((l) => l.id === layoutId)!;
  return (
    <>
      <div className="row-head">
        <strong>{layout.name}</strong>
        <small>
          {layout.sample.name} · art {layout.art.x}–{+(layout.art.x + layout.art.w).toFixed(1)}% × {layout.art.y}–{+(layout.art.y + layout.art.h).toFixed(1)}%
        </small>
      </div>
      {ERA_COLUMNS.map((c) => (
        <div key={c.label} className="lab-card">
          <FoilCard image={layout.sample.image} rarity={layout.sample.rarity} finish={c.finish} treatment={c.treatment} layout={layout} showArtBox={showArtBox} />
        </div>
      ))}
    </>
  );
}
