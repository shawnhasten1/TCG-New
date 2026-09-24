// A pack wrapper up close, like CardDetail for cards: tilt it to catch the foil, or tap it to bring it to the
// middle of the screen, where it sways in the light until you take over.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { useSettings } from "../app/settings";
import { FoilPack } from "../foil/FoilPack";
import { followMotion, recenterMotion } from "../opener/motion";
import { Tilt } from "../opener/tilt";
import type { PackArt } from "../packs/art";
import "./collection.css";

interface Props {
  art: PackArt;
  setName: string;
  /** Packs opened in this wrapper. */
  count: number;
  firstOpenedAt: string;
  /** Designs found in its set, of how many. */
  found: number;
  total: number;
  onClose(): void;
}

export function PackDetail({ art, setName, count, firstOpenedAt, found, total, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const packRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const reduced = useMemo(() => matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const coarse = useMemo(() => matchMedia("(pointer: coarse)").matches, []);
  const tilt = useMemo(() => new Tilt(reduced), [reduced]);
  const [zoomed, setZoomed] = useState(false);
  const [zoom, setZoom] = useState<{ x: number; y: number; s: number } | null>(null);
  const idle = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** The current press, so a tilt-drag isn't also taken as a tap. */
  const press = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const { motion } = useSettings();
  useEffect(() => (motion ? followMotion(tilt) : undefined), [tilt, motion]);

  useEffect(() => {
    const d = dialogRef.current!;
    if (!d.open) d.showModal();
    tilt.setActive(packRef.current, 16);
    tilt.start();
    // Turns in the light for a moment on opening, so the foil shows before it's touched.
    tilt.showcase(2600, reduced ? 0 : 350);
    return () => tilt.stop();
  }, [tilt, reduced]);

  /* ---------- Showcase: the pack flies to the middle of the screen, grows, and sways ---------- */
  const fit = () => {
    const r = slotRef.current!.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const s = Math.max(1, Math.min((vw * 0.9) / r.width, (vh * 0.85) / r.height, 2.4));
    setZoom({ x: vw / 2 - (r.left + r.width / 2), y: vh / 2 - (r.top + r.height / 2), s });
  };
  useLayoutEffect(() => {
    if (!zoomed) {
      setZoom(null);
      return;
    }
    fit();
    recenterMotion();
    tilt.showcase(Infinity, reduced ? 0 : 800);
    const onResize = () => fit();
    addEventListener("resize", onResize);
    return () => {
      removeEventListener("resize", onResize);
      clearTimeout(idle.current);
      tilt.rest();
    };
  }, [zoomed, tilt, reduced]);

  const onPointerDown = (e: PointerEvent) => {
    press.current = { x: e.clientX, y: e.clientY, moved: false };
    // A finger has no hover, so the tilt starts where it lands.
    if (e.pointerType !== "mouse") onPointerMove(e);
  };

  /** Tilts toward the pointer; while zoomed, anywhere on screen counts, and the sway resumes when it goes still. */
  const onPointerMove = (e: PointerEvent) => {
    const p = press.current;
    if (p && !p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) p.moved = true;
    if (!zoomed && !slotRef.current?.contains(e.target as Node)) return;
    tilt.aim(e.clientX, e.clientY);
    if (!zoomed) return;
    clearTimeout(idle.current);
    idle.current = setTimeout(() => tilt.showcase(), 2500);
  };

  const close = () => dialogRef.current?.close();
  const tapped = () => !press.current?.moved;

  return (
    <dialog
      ref={dialogRef}
      aria-label={`${setName} pack: ${art.name}`}
      className={`card-detail pack-detail${zoomed ? " zoomed" : ""}`}
      onClose={onClose}
      onCancel={(e) => {
        // Escape backs out of the showcase before it closes the dialog.
        if (!zoomed) return;
        e.preventDefault();
        setZoomed(false);
      }}
      onClick={(e) => {
        if (!tapped()) return;
        if (zoomed) setZoomed(false);
        else if (e.target === dialogRef.current) close();
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
    >
      <div className="sheet-bar">
        <span className="handle" aria-hidden="true" />
        <button type="button" className="close-x" aria-label="Close" onClick={close}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <div className="detail-body">
        <div className="detail-card" ref={slotRef} style={{ aspectRatio: art.aspect }} onPointerLeave={() => !zoomed && tilt.rest()}>
          <div
            className="showcase"
            role="button"
            tabIndex={0}
            aria-pressed={zoomed}
            aria-label={zoomed ? "Put the pack back" : "Show the pack up close"}
            style={zoom ? ({ "--zx": `${zoom.x}px`, "--zy": `${zoom.y}px`, "--zs": zoom.s } as CSSProperties) : undefined}
            onClick={(e) => {
              e.stopPropagation();
              if (tapped()) setZoomed(!zoomed);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setZoomed(!zoomed);
                return;
              }
              const k = ({ ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] } as Record<string, [number, number]>)[e.key];
              if (k) {
                e.preventDefault();
                tilt.nudge(...k);
              }
            }}
          >
            <FoilPack ref={packRef} src={art.src} />
          </div>
        </div>
        <div className="detail-info">
          <h2>{art.name}</h2>
          <p className="muted">{setName} booster pack</p>
          <h3>In your collection</h3>
          <ul className="copies">
            <li>
              Opened <strong>×{count}</strong>
            </li>
            <li>
              {found} of {total} {setName} designs found
            </li>
          </ul>
          <p className="muted">First opened {new Date(firstOpenedAt).toLocaleDateString()}</p>
          <p className="muted tilt-tip">{coarse ? "Drag the pack or tip your phone to catch the foil." : "Move over the pack to catch the foil. Arrow keys tilt it too."}</p>
        </div>
      </div>
      {zoomed && (
        <p className="zoom-hint" aria-hidden="true">
          {coarse ? "Drag to tilt · tap to put it back" : "Move to tilt · click to put it back"}
        </p>
      )}
    </dialog>
  );
}
