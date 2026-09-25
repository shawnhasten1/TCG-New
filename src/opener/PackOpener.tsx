// The opening experience, ported from the "Booster pack opening" prototype:
// drag across the top to tear, cards slide out, tap through them one by one.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { cardImage } from "../api/tcgdex";
import { sfx } from "../app/sound";
import type { SetDetail } from "../api/types";
import { CardDetail } from "../collection/CardDetail";
import { ownership, type Ownership } from "../collection/progress";
import { getPulls } from "../collection/store";
import { setTier, tierInfo, type SetTier } from "../engine/setRarity";

/** The sealed pack wears a set-rarity tag in the same colours as the card rarity tag. */
const PACK_TAG_KIND: Record<SetTier, RarityKind> = { common: "common", uncommon: "uncommon", rare: "rare", legendary: "chase" };
import { isShiny, pullTier, tagKind, type RarityKind } from "../engine/tiers";
import type { PulledCard } from "../engine/types";
import { preloadPack, withTimeout } from "./preload";
import { buildTear, setRipDirection, setTearProgress, type Point, type TearParts } from "./tear";
import { FoilCard } from "../foil/FoilCard";
import { PackShine } from "../foil/FoilPack";
import { layoutFor, type FrameLayout } from "../foil/layouts";
import { useSettings } from "../app/settings";
import { followMotion, recenterMotion } from "./motion";
import { href } from "../app/router";
import { OpenerBar } from "./OpenerBar";
import { Tilt } from "./tilt";
import "./opener.css";
import { SetLogo } from "../app/SetLogo";
import { RetryImg, useRetriedCssSrc } from "../app/RetryImg";

type Phase = "sealed" | "opening" | "reveal" | "summary";

interface Props {
  set: SetDetail;
  pulls: PulledCard[];
  /** Cards not in the collection before this pack, shown with a "New" badge. */
  newIds?: Set<string>;
  /** Called once, when the pack is torn open (the pack is saved then). */
  onOpened?(): void;
  onAgain(): void;
  binderHref?: string;
  /** Daily-limit status line, e.g. "2 of 3 packs left today". */
  limitNote?: string;
  /** How many packs until a guaranteed rare / legendary set. */
  pityNote?: string;
  /** False when the daily limit is used up. */
  canOpenAgain?: boolean;
  /** The label on the button for the next pack. */
  againLabel?: string;
  /** Shares cards (by position in the pack) to the friends feed; returns every position shared so far. Absent for guests. */
  onShare?(slots: number[]): Promise<number[]>;
  /** A photo of the real sealed pack, worn instead of TCGdex's booster artwork or the generic wrapper (trialled in the pack lab).
   *  With `aspect` (width / height) the pack takes the photo's shape; without, the photo is cropped to the usual pack shape. */
  packPhoto?: { src: string; aspect?: number };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The top of the pack that tears when dragged across (a fraction of its height). */
const TEAR_STRIP = 0.32;

/** Stable 0–359 hue per set, for the generic wrapper. */
function setHue(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export function PackOpener({ set, pulls, newIds, onOpened, onAgain, binderHref, limitNote, pityNote, canOpenAgain = true, againLabel = "Open another pack", onShare, packPhoto }: Props) {
  const reduced = useMemo(() => matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const tilt = useMemo(() => new Tilt(reduced), [reduced]);
  const preload = useMemo(() => preloadPack(pulls), [pulls]);
  const layout = layoutFor(set.serie.id);
  const { motion } = useSettings();

  const wrapRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLParagraphElement>(null);
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

  /* ---------- Sharing to the feed ---------- */
  const [shared, setShared] = useState<Set<number>>(new Set());
  const [sharing, setSharing] = useState(false);
  const [shareNote, setShareNote] = useState<{ kind: "ok" | "error"; text: string }>();
  /** Cards picked in the summary to share, or undefined when not picking. */
  const [picking, setPicking] = useState<Set<number>>();

  const share = async (slots: number[]) => {
    if (!onShare || sharing || !slots.length) return;
    setSharing(true);
    setShareNote(undefined);
    try {
      setShared(new Set(await onShare(slots)));
      setPicking(undefined);
      setShareNote({ kind: "ok", text: slots.length === 1 ? "Shared to your feed." : `Shared ${slots.length} cards to your feed.` });
    } catch (err) {
      setShareNote({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSharing(false);
    }
  };
  const togglePick = (i: number) =>
    setPicking((p) => {
      const next = new Set(p);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const parts = (): TearParts => ({ packTop: topRef.current!, packBody: bodyRef.current!, guide: guideRef.current!, rip: ripRef.current! });
  const go = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  useEffect(() => {
    tear.current.pts = buildTear(parts());
    setTearProgress(parts(), 0, 1);
    tilt.setActive(packRef.current, 8);
    tilt.start();
    return () => tilt.stop();
  }, [tilt]);

  useEffect(() => (motion ? followMotion(tilt) : undefined), [tilt, motion]);

  const setTear = (p: number) => {
    tear.current.progress = Math.min(Math.max(p, 0), 1);
    setTearProgress(parts(), tear.current.progress, tear.current.dir);
  };

  /* ---------- Opening sequence ---------- */
  const open = async (viaKeyboard = false) => {
    if (phaseRef.current !== "sealed") return;
    go("opening");
    onOpened?.();
    sfx.tear();
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
    sfx.slide();
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
    recenterMotion();
    if (focusOnReveal.current) card?.focus({ preventScroll: true });
    const burst = burstRef.current!;
    const tier = pullTier(pulls[idx]);
    // Big pulls turn themselves in the light for a moment, until the pointer takes over.
    if (tier >= 2) tilt.showcase(3200, 450);
    if (idx > 0) sfx.flip();
    const chime = tier > 0 ? setTimeout(() => sfx.hit(tier), 120) : undefined;
    burst.classList.remove("go");
    if (tier > 0 && !reduced) {
      burst.dataset.tier = String(tier);
      burst.toggleAttribute("data-shiny", isShiny(pulls[idx].card.rarity));
      void burst.offsetWidth; // restart the animation
      burst.classList.add("go");
    }
    return () => clearTimeout(chime);
  }, [phase, idx, pulls, tilt, reduced]);

  const next = () => {
    if (phaseRef.current !== "reveal") return;
    focusOnReveal.current = !!stackRef.current?.contains(document.activeElement);
    setShareNote(undefined);
    if (idx < pulls.length - 1) setIdx(idx + 1);
    else {
      tilt.setActive(null, 0);
      go("summary");
    }
  };

  /* ---------- Revealed cards grow to fill the space the wrapper leaves ---------- */
  useLayoutEffect(() => {
    if (phase !== "reveal") return;
    const fit = () => {
      const wrap = wrapRef.current;
      const hint = hintRef.current;
      const bar = document.querySelector(".opener .topbar");
      if (!wrap || !hint) return;
      // Layout box (offset*), not getBoundingClientRect, so the fit already applied doesn't skew it.
      const parent = (wrap.offsetParent ?? document.body).getBoundingClientRect();
      const x = parent.left + wrap.offsetLeft;
      const y = parent.top + wrap.offsetTop;
      const w = wrap.offsetWidth;
      const h = wrap.offsetHeight;
      // Where the settled card sits in the wrapper (see .stack in opener.css: top 15%, then translateY(-7.3%)).
      const cw = w / 1.12;
      const ch = (cw * 825) / 600;
      const cy = y + 0.15 * h - 0.073 * ch + ch / 2;
      const cx = x + w / 2;
      // Free space: below the top bar, above the hint, leaving room for the badge and rarity tag.
      const top = (bar?.getBoundingClientRect().bottom ?? 0) + 14;
      const bottom = hint.getBoundingClientRect().top - 24;
      const vw = document.documentElement.clientWidth;
      const s = Math.max(1, Math.min((vw - 40) / cw, (bottom - top) / ch, 1.5));
      const st = wrap.style;
      st.setProperty("--fit-s", s.toFixed(3));
      st.setProperty("--fit-ox", `${w / 2}px`);
      st.setProperty("--fit-oy", `${cy - y}px`);
      st.setProperty("--fit-x", `${vw / 2 - cx}px`);
      st.setProperty("--fit-y", `${(top + bottom) / 2 - cy}px`);
    };
    fit();
    addEventListener("resize", fit);
    return () => removeEventListener("resize", fit);
  }, [phase, idx]);

  /* ---------- Pack interaction: drag across the top to tear ---------- */
  /** Whether the pointer is over the tear strip. */
  const onTearStrip = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return (e.clientY - r.top) / r.height <= TEAR_STRIP;
  };
  const onPackDown = (e: PointerEvent<HTMLDivElement>) => {
    if (phaseRef.current !== "sealed" || !onTearStrip(e)) return;
    tilt.hold();
    Object.assign(tear.current, { tearing: true, startX: e.clientX, base: tear.current.progress });
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPackMove = (e: PointerEvent<HTMLDivElement>) => {
    if (phaseRef.current !== "sealed") return;
    const t = tear.current;
    // The pack holds still on the tear strip and while it's being torn, so the rip goes where it's dragged.
    if (t.tearing || onTearStrip(e)) tilt.hold();
    else tilt.aim(e.clientX, e.clientY);
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
    tilt.hold();
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
  const packTier = setTier(set.id);
  if (phase === "sealed") hint = "Drag across the top of the pack to tear it open.";
  else if (phase === "opening" && waitingForImages) hint = "Loading cards…";
  else if (phase === "reveal") {
    const lead = `Card ${idx + 1} of ${pulls.length}.`;
    const tail = isLast ? "Tap for the pack summary." : "Tap the card to see the next one.";
    if (tier >= 2) hint = `${lead} ${current.card.rarity}! ${current.finish !== "normal" ? "Tilt it to see the foil." : tail}`;
    else hint = `${lead} ${tail}`;
  }

  const booster = set.boosters?.find((b) => b.artwork_front);
  const art = useRetriedCssSrc(packPhoto ? packPhoto.src : booster && `${booster.artwork_front}.webp`);
  const wrapperStyle = {
    "--h": setHue(set.id),
    ...(art ? { "--art": `url("${art}")` } : {}),
    ...(packPhoto?.aspect ? { "--pack-aspect": packPhoto.aspect } : {}),
  } as CSSProperties;

  return (
    <div className="opener">
      <OpenerBar />

      {phase === "summary" ? (
        <PackSummary pulls={pulls} newIds={newIds} official={set.cardCount.official} layout={layout} shared={shared} picking={picking} onPick={togglePick} />
      ) : (
        <div className={`wrap enter${phase === "reveal" ? " fitted" : ""}${packPhoto?.aspect ? " photo-shape" : ""}`} ref={wrapRef} style={wrapperStyle}>
          <div
            className={`pack sealed${art ? " has-art" : ""}${packPhoto ? " photo" : ""}`}
            ref={packRef}
            onPointerDown={onPackDown}
            onPointerMove={onPackMove}
            onPointerUp={onPackUp}
            onPointerCancel={onPackUp}
            onPointerLeave={onPackLeave}
          >
            <div className="layer pack-body" ref={bodyRef}>
              {!art && (
                <div className="pack-art">
                  <SetLogo logo={set.logo} className="pack-logo" alt={set.name} draggable={false} fallback={<div className="set-name">{set.name}</div>} />
                </div>
              )}
              <div className="crimp" />
              {packPhoto ? <PackShine /> : <div className="sheen" />}
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
                  <FoilCard
                    ref={(el) => void (cardRefs.current[i] = el)}
                    image={pull.card.image}
                    rarity={pull.card.rarity}
                    category={pull.card.category}
                    trainerType={pull.card.trainerType}
                    types={pull.card.types}
                    stage={pull.card.stage}
                    finish={pull.finish}
                    layout={layout}
                    data-tier={pullTier(pull)}
                    tabIndex={phase === "reveal" && i === idx ? 0 : -1}
                    aria-label={cardLabel(pull) + (newIds?.has(pull.card.id) ? " New to your collection." : "")}
                  />
                  {newIds?.has(pull.card.id) && phase === "reveal" && i === idx && <span className="new-badge">New</span>}
                  {phase === "reveal" && i === idx && pull.card.rarity && pull.card.rarity !== "None" && (
                    <span className="rarity-tag" data-kind={tagKind(pull.card.rarity)} aria-hidden="true">
                      {isShiny(pull.card.rarity) && "✦ "}
                      {pull.card.rarity}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="layer pack-top" ref={topRef}>
              <div className="crimp" />
              <span className="tear-label">✂ tear here</span>
              {packPhoto ? <PackShine /> : <div className="sheen" />}
            </div>

            <svg className="tear-line" ref={tearLineRef} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <polyline ref={guideRef} className="guide" fill="none" vectorEffect="non-scaling-stroke" strokeWidth="1.5" pathLength={100} />
              <polyline ref={ripRef} className="rip" fill="none" vectorEffect="non-scaling-stroke" strokeWidth="2.5" pathLength={1} strokeDashoffset={1} />
            </svg>

            {phase === "sealed" && (
              <span className="rarity-tag" data-kind={PACK_TAG_KIND[packTier]} aria-hidden="true">
                {tierInfo(packTier).name}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Kept through "opening" too, so the pack doesn't jump when the button goes. */}
      {(phase === "sealed" || phase === "opening") && (
        <div className="controls">
          {phase === "sealed" && (
            <button type="button" onClick={tearWithButton}>
              Tear open
            </button>
          )}
        </div>
      )}
      <p className="hint" ref={hintRef} aria-live="polite">
        {hint}
      </p>
      {limitNote && (phase === "sealed" || phase === "summary" || (phase === "reveal" && isLast)) && <p className="limit-note">{limitNote}</p>}
      {pityNote && (phase === "sealed" || phase === "summary") && <p className="limit-note">{pityNote}</p>}
      {shareNote && (
        <p className={`share-note ${shareNote.kind}`} role={shareNote.kind === "error" ? "alert" : "status"}>
          {shareNote.text}
          {shareNote.kind === "ok" && (
            <>
              {" "}
              <a href={href.feed()}>See the feed</a>
            </>
          )}
        </p>
      )}
      {phase === "reveal" && (
        <div className="controls">
          {onShare && (
            <button type="button" className="share-button" onClick={() => void share([idx])} disabled={sharing || shared.has(idx)}>
              {shared.has(idx) ? "Shared" : sharing ? "Sharing…" : "Share"}
            </button>
          )}
        </div>
      )}
      {phase === "summary" && picking && (
        <div className="controls">
          <button type="button" className="primary" onClick={() => void share([...picking])} disabled={sharing || picking.size === 0}>
            {sharing ? "Sharing…" : picking.size ? `Share ${picking.size} ${picking.size === 1 ? "card" : "cards"}` : "Pick cards to share"}
          </button>
          <button type="button" onClick={() => (setPicking(undefined), setShareNote(undefined))}>
            Cancel
          </button>
        </div>
      )}
      {phase === "summary" && !picking && (
        <div className="controls">
          {phase === "summary" && onShare && shared.size < pulls.length && (
            <button type="button" onClick={() => (setPicking(new Set()), setShareNote(undefined))}>
              Share cards…
            </button>
          )}
          {canOpenAgain && phase === "summary" && (
            <button type="button" className="primary" onClick={onAgain} autoFocus={phase === "summary"}>
              {againLabel}
            </button>
          )}
          {phase === "summary" && binderHref && (
            <a className="button" href={binderHref}>
              View binder
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function cardLabel(p: PulledCard): string {
  const extras = [p.card.rarity, p.finish !== "normal" ? p.finish : "", p.firstEdition ? "1st Edition" : ""].filter(Boolean);
  return `${p.card.name}, ${extras.join(", ")}. Press Enter for the next card; arrow keys tilt.`;
}

interface SummaryProps {
  pulls: PulledCard[];
  newIds?: Set<string>;
  official: number;
  layout: FrameLayout;
  /** Positions already shared to the feed. */
  shared: Set<number>;
  /** Positions picked to share, while picking; tapping a card then picks it instead of opening it. */
  picking?: Set<number>;
  onPick(i: number): void;
}

function PackSummary({ pulls, newIds, official, layout, shared, picking, onPick }: SummaryProps) {
  const [selected, setSelected] = useState<PulledCard>();
  // The pack is saved when it's torn open, so the collection already counts these cards.
  const [owned, setOwned] = useState<Map<string, Ownership>>();
  useEffect(() => {
    let live = true;
    getPulls().then((p) => live && setOwned(ownership(p)));
    return () => {
      live = false;
    };
  }, [pulls]);

  return (
    <section className={`summary-grid${picking ? " picking" : ""}`} aria-label="Pack summary">
      {pulls.map((p, i) => (
        <figure key={i} data-tier={pullTier(p)} data-finish={p.finish} data-shiny={isShiny(p.card.rarity) || undefined} data-picked={picking?.has(i) || undefined}>
          {picking ? (
            <button type="button" aria-pressed={picking.has(i)} disabled={shared.has(i)} aria-label={shared.has(i) ? `${p.card.name}, already shared` : `Share ${p.card.name}`} onClick={() => onPick(i)}>
              <RetryImg src={cardImage(p.card, "low")} alt="" />
            </button>
          ) : (
            <button type="button" aria-label={`Look closer at ${p.card.name}`} onClick={() => setSelected(p)}>
              <RetryImg src={cardImage(p.card, "low")} alt="" />
            </button>
          )}
          {newIds?.has(p.card.id) && <span className="new-badge">New</span>}
          {picking?.has(i) && (
            <span className="pick-check" aria-hidden="true">
              ✓
            </span>
          )}
          {shared.has(i) && <span className="shared-chip">Shared</span>}
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
      {selected && (
        <CardDetail
          card={selected.card}
          official={official}
          owned={owned?.get(selected.card.id)}
          layout={layout}
          finish={selected.finish}
          onClose={() => setSelected(undefined)}
        />
      )}
    </section>
  );
}
