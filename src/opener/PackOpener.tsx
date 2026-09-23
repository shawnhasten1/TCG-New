// The opening experience, ported from the "Booster pack opening" prototype:
// drag across the top to tear, cards slide out, tap through them one by one.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type Ref } from "react";
import { cardImage } from "../api/tcgdex";
import type { SetDetail } from "../api/types";
import { pullTier } from "../engine/tiers";
import type { PulledCard } from "../engine/types";
import { preloadPack, withTimeout } from "./preload";
import { buildTear, setRipDirection, setTearProgress, type Point, type TearParts } from "./tear";
import { ensureSparkles } from "./sparkles";
import { Tilt } from "./tilt";
import "./opener.css";

type Phase = "sealed" | "opening" | "reveal" | "summary";

interface Props {
  set: SetDetail;
  pulls: PulledCard[];
  onAgain(): void;
  onBack(): void;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Stable 0–359 hue per set, for the generic wrapper. */
function setHue(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export function PackOpener({ set, pulls, onAgain, onBack }: Props) {
  const reduced = useMemo(() => matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const tilt = useMemo(() => new Tilt(reduced), [reduced]);
  const preload = useMemo(() => preloadPack(pulls), [pulls]);

  const packRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const burstRef = useRef<HTMLDivElement>(null);
  const tearLineRef = useRef<SVGSVGElement>(null);
  const guideRef = useRef<SVGPolylineElement>(null);
  const ripRef = useRef<SVGPolylineElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [phase, setPhase] = useState<Phase>("sealed");
  const phaseRef = useRef<Phase>("sealed");
  const [idx, setIdx] = useState(0);
  const [waitingForImages, setWaitingForImages] = useState(false);
  const focusOnReveal = useRef(false);
  const tear = useRef({ pts: [] as Point[], progress: 0, dir: 1, dirLocked: false, tearing: false, startX: 0, base: 0 });
  const downAt = useRef<[number, number] | null>(null);

  const parts = (): TearParts => ({ packTop: topRef.current!, packBody: bodyRef.current!, guide: guideRef.current!, rip: ripRef.current! });
  const go = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  useEffect(() => {
    ensureSparkles();
    tear.current.pts = buildTear(parts());
    setTearProgress(parts(), 0, 1);
    tilt.setActive(packRef.current, 8);
    tilt.start();
    return () => tilt.stop();
  }, [tilt]);

  const setTear = (p: number) => {
    tear.current.progress = Math.min(Math.max(p, 0), 1);
    setTearProgress(parts(), tear.current.progress, tear.current.dir);
  };

  /* ---------- Opening sequence ---------- */
  const open = async (viaKeyboard = false) => {
    if (phaseRef.current !== "sealed") return;
    go("opening");
    tilt.rest();
    const pack = packRef.current!;
    const top = topRef.current!;
    const stack = stackRef.current!;
    const { dir } = tear.current;
    pack.classList.remove("sealed");
    tearLineRef.current!.style.opacity = "0";
    top.classList.add("flying");
    top.style.transform = `translate(${dir * 45}%, -120%) rotate(${dir * 24}deg)`;
    await wait(250);
    // Hold the cards in the pack until their high-quality images are ready.
    const note = setTimeout(() => setWaitingForImages(true), 300);
    await withTimeout(preload, 8000);
    clearTimeout(note);
    setWaitingForImages(false);
    stack.style.transform = "translateY(-58%)"; // cards slide up out of the mouth
    await wait(750);
    bodyRef.current!.classList.add("leave"); // wrapper drops away
    pack.classList.add("out"); // cards move in front
    await wait(250);
    stack.style.transform = "translateY(-7.3%)"; // settle centered
    await wait(550);
    focusOnReveal.current = viaKeyboard;
    go("reveal");
  };

  /* ---------- Revealing cards one by one ---------- */
  useEffect(() => {
    if (phase !== "reveal") return;
    const card = cardRefs.current[idx];
    tilt.setActive(card, 16);
    if (focusOnReveal.current) card?.focus({ preventScroll: true });
    const burst = burstRef.current!;
    const tier = pullTier(pulls[idx]);
    burst.classList.remove("go");
    if (tier > 0 && !reduced) {
      burst.dataset.tier = String(tier);
      void burst.offsetWidth; // restart the animation
      burst.classList.add("go");
    }
  }, [phase, idx, pulls, tilt, reduced]);

  const next = () => {
    if (phaseRef.current !== "reveal") return;
    focusOnReveal.current = !!stackRef.current?.contains(document.activeElement);
    if (idx < pulls.length - 1) setIdx(idx + 1);
    else {
      tilt.setActive(null, 0);
      go("summary");
    }
  };

  /* ---------- Pack interaction: drag across the top to tear ---------- */
  const onPackDown = (e: PointerEvent<HTMLDivElement>) => {
    if (phaseRef.current !== "sealed") return;
    const r = e.currentTarget.getBoundingClientRect();
    if ((e.clientY - r.top) / r.height > 0.32) return; // only the top strip tears
    Object.assign(tear.current, { tearing: true, startX: e.clientX, base: tear.current.progress });
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPackMove = (e: PointerEvent<HTMLDivElement>) => {
    if (phaseRef.current !== "sealed") return;
    tilt.aim(e.clientX, e.clientY);
    const t = tear.current;
    if (!t.tearing) return;
    const dx = e.clientX - t.startX;
    if (!t.dirLocked && Math.abs(dx) > 6) {
      // The first drag decides the direction.
      t.dir = Math.sign(dx);
      t.dirLocked = true;
      setRipDirection(ripRef.current!, t.pts, t.dir);
    }
    if (t.dirLocked) setTear(t.base + (Math.max(0, dx * t.dir) / e.currentTarget.getBoundingClientRect().width) * 1.15);
    if (t.progress >= 1) {
      t.tearing = false;
      void open();
    }
  };
  const onPackUp = () => {
    tear.current.tearing = false;
    if (phaseRef.current === "sealed" && tear.current.progress >= 0.8) void open();
  };
  const onPackLeave = () => {
    if (!tear.current.tearing && phaseRef.current === "sealed") tilt.rest();
  };

  const tearWithButton = () => {
    if (phaseRef.current !== "sealed") return;
    tear.current.dirLocked = true;
    const from = tear.current.progress;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - t0) / 650, 1);
      setTear(from + (1 - from) * (1 - Math.pow(1 - t, 2)));
      if (t < 1) requestAnimationFrame(step);
      else void open(true);
    };
    requestAnimationFrame(step);
  };

  /* ---------- Card interaction: tap for next, drag or arrows to tilt ---------- */
  const onStackMove = (e: PointerEvent) => {
    if (phaseRef.current === "reveal") tilt.aim(e.clientX, e.clientY);
  };
  const onStackDown = (e: PointerEvent) => {
    downAt.current = [e.clientX, e.clientY];
    if (e.pointerType !== "mouse" && phaseRef.current === "reveal") tilt.aim(e.clientX, e.clientY);
  };
  const onStackUp = (e: PointerEvent) => {
    if (!downAt.current) return;
    const moved = Math.hypot(e.clientX - downAt.current[0], e.clientY - downAt.current[1]);
    downAt.current = null;
    if (e.pointerType !== "mouse") tilt.rest();
    if (moved < 8) next(); // a tap, not a tilt-drag
  };
  const onStackKey = (e: KeyboardEvent) => {
    if (phaseRef.current !== "reveal") return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      next();
      return;
    }
    const k = ({ ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] } as Record<string, [number, number]>)[e.key];
    if (k) {
      e.preventDefault();
      tilt.nudge(...k);
    } else if (e.key === "Escape") tilt.rest();
  };

  /* ---------- Render ---------- */
  const current = pulls[idx];
  const tier = current ? pullTier(current) : 0;
  const isLast = idx === pulls.length - 1;
  let hint = "";
  if (phase === "sealed") hint = "Drag across the top of the pack to tear it open.";
  else if (phase === "opening" && waitingForImages) hint = "Loading cards…";
  else if (phase === "reveal") {
    const lead = `Card ${idx + 1} of ${pulls.length}.`;
    const tail = isLast ? "Tap for the pack summary." : "Tap the card to see the next one.";
    if (tier >= 2) hint = `${lead} ${current.card.rarity}! ${current.finish !== "normal" ? "Tilt it to see the foil." : tail}`;
    else hint = `${lead} ${tail}`;
  }

  const booster = set.boosters?.find((b) => b.artwork_front);
  const wrapperStyle = {
    "--h": setHue(set.id),
    ...(booster ? { "--art": `url(${booster.artwork_front}.webp)` } : {}),
  } as CSSProperties;

  return (
    <div className="opener">
      <button type="button" className="back" onClick={onBack}>
        ← Sets
      </button>

      {phase === "summary" ? (
        <PackSummary pulls={pulls} />
      ) : (
        <div className="wrap enter" style={wrapperStyle}>
          <div
            className={`pack sealed${booster ? " has-art" : ""}`}
            ref={packRef}
            onPointerDown={onPackDown}
            onPointerMove={onPackMove}
            onPointerUp={onPackUp}
            onPointerCancel={onPackUp}
            onPointerLeave={onPackLeave}
          >
            <div className="layer pack-body" ref={bodyRef}>
              {!booster && (
                <div className="pack-art">
                  {set.logo ? <img className="pack-logo" src={`${set.logo}.webp`} alt="" draggable={false} /> : <div className="set-name">{set.name}</div>}
                  <div className="pack-sub">
                    {set.logo && set.name}
                    {set.logo && <br />}
                    Booster pack · {pulls.length} cards
                  </div>
                </div>
              )}
              <div className="crimp" />
              <div className="sheen" />
            </div>

            <div
              className="stack"
              ref={stackRef}
              onPointerMove={onStackMove}
              onPointerDown={onStackDown}
              onPointerUp={onStackUp}
              onPointerLeave={() => phaseRef.current === "reveal" && tilt.rest()}
              onKeyDown={onStackKey}
            >
              <div className="burst" ref={burstRef} />
              {pulls.map((pull, i) => (
                <div
                  key={i}
                  className={`slot${phase === "reveal" && i < idx ? " gone" : ""}${phase === "reveal" && i === idx ? " top" : ""}`}
                  style={{ "--i": Math.max(0, i - idx), zIndex: pulls.length - i } as CSSProperties}
                >
                  <CardView pull={pull} ref={(el) => void (cardRefs.current[i] = el)} focusable={phase === "reveal" && i === idx} />
                </div>
              ))}
            </div>

            <div className="layer pack-top" ref={topRef}>
              <div className="crimp" />
              <span className="tear-label">✂ tear here</span>
              <div className="sheen" />
            </div>

            <svg className="tear-line" ref={tearLineRef} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <polyline ref={guideRef} className="guide" fill="none" vectorEffect="non-scaling-stroke" strokeWidth="1.5" pathLength={100} />
              <polyline ref={ripRef} className="rip" fill="none" vectorEffect="non-scaling-stroke" strokeWidth="2.5" pathLength={1} strokeDashoffset={1} />
            </svg>
          </div>
        </div>
      )}

      <p className="hint" aria-live="polite">
        {hint}
      </p>
      <div className="controls">
        {phase === "sealed" && (
          <button type="button" onClick={tearWithButton}>
            Tear open
          </button>
        )}
        {(phase === "summary" || (phase === "reveal" && isLast)) && (
          <button type="button" className="primary" onClick={onAgain} autoFocus={phase === "summary"}>
            Open another pack
          </button>
        )}
      </div>
    </div>
  );
}

interface CardViewProps {
  pull: PulledCard;
  focusable: boolean;
  ref?: Ref<HTMLDivElement>;
}

function CardView({ pull, focusable, ref }: CardViewProps) {
  const [src, setSrc] = useState(() => cardImage(pull.card, "high"));
  const foil = pull.finish !== "normal";
  return (
    <div
      className="card"
      ref={ref}
      data-finish={pull.finish}
      data-tier={pullTier(pull)}
      tabIndex={focusable ? 0 : -1}
      aria-label={`${pull.card.name}, ${pull.card.rarity}${foil ? `, ${pull.finish}` : ""}${pull.firstEdition ? ", 1st Edition" : ""}. Press Enter for the next card; arrow keys tilt.`}
    >
      <div className="face">
        <img src={src} alt="" draggable={false} onError={() => setSrc(cardImage(pull.card, "low"))} />
        {foil && (
          <>
            <div className="foil" />
            <div className="glitter" />
          </>
        )}
        <div className="glare" />
      </div>
    </div>
  );
}

function PackSummary({ pulls }: { pulls: PulledCard[] }) {
  return (
    <section className="summary-grid" aria-label="Pack summary">
      {pulls.map((p, i) => (
        <figure key={i} data-tier={pullTier(p)} data-finish={p.finish}>
          <img src={cardImage(p.card, "low")} alt={p.card.name} />
          <figcaption>
            {p.card.name}
            <small>
              {p.card.rarity}
              {p.finish !== "normal" ? ` · ${p.finish}` : ""}
              {p.firstEdition ? " · 1st Ed" : ""}
            </small>
          </figcaption>
        </figure>
      ))}
    </section>
  );
}
