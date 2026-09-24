// Art windows per era and card kind: where holo foil goes, and what reverse foil leaves out.
// Measured on 600×825 TCGdex scans (2026-09-24), % of the card image (x across, y down). Tune them on the
// foil lab page (#/foil) with "Show art box" on.
// Each window is the art rectangle minus cut-outs: the evolution portrait and "Evolves from" strip on Stage
// cards, and the "BASIC" label on DP/HGSS Basics. Trainers have their own, lower window in every era.

import type { FrameLayout } from "./layouts";

export type CardKind = "basic" | "stage" | "trainer";

type Rect = { x0: number; y0: number; x1: number; y1: number; r?: number };
type Cut = ({ rect: Rect } | { ellipse: { cx: number; cy: number; rx: number; ry: number } });
export interface ArtShape {
  art: Rect;
  cuts?: Cut[];
}

const R = (x0: number, y0: number, x1: number, y1: number, r = 0.4): Rect => ({ x0, y0, x1, y1, r });
const cutRect = (x1: number, y1: number, r = 0.6): Cut => ({ rect: { x0: -5, y0: -5, x1, y1, r } });
const cutEllipse = (cx: number, cy: number, rx: number, ry: number): Cut => ({ ellipse: { cx, cy, rx, ry } });

export const ART_WINDOWS: Record<string, Record<CardKind, ArtShape>> = {
  wotc: {
    basic: { art: R(10.5, 11.8, 89.2, 51.2, 0.3) },
    // The gold "STAGE" badge with the pre-evolution sits over the art's top-left corner.
    stage: { art: R(10.5, 11.8, 89.2, 51.2, 0.3), cuts: [cutRect(20, 17.5, 1.5)] },
    trainer: { art: R(9.5, 23.2, 91, 55.8, 0.3) },
  },
  ecard: {
    basic: { art: R(9.5, 12, 96.5, 49, 3) },
    stage: { art: R(9.5, 12, 96.5, 49, 3) },
    trainer: { art: R(4.5, 16.2, 96.5, 50, 4) },
  },
  ex: {
    basic: { art: R(8, 9.3, 92.3, 46.7) },
    stage: { art: R(8, 9.3, 92.3, 46.7) },
    trainer: { art: R(9.5, 14.5, 90.6, 48.8) },
  },
  dp: {
    basic: { art: R(6.8, 9.2, 93.5, 49.8), cuts: [cutRect(22, 10.7)] },
    stage: { art: R(6.8, 9.2, 93.5, 49.8), cuts: [cutRect(52, 10.8), cutEllipse(11.5, 11.8, 6.8, 5.3)] },
    trainer: { art: R(9.3, 14, 90.7, 50.2) },
  },
  hgss: {
    basic: { art: R(5.2, 9.3, 94.7, 52.3), cuts: [cutRect(22, 10.8)] },
    stage: { art: R(5.2, 9.3, 94.7, 52.3), cuts: [cutRect(66, 10.9)] },
    trainer: { art: R(7.6, 13.5, 93.2, 53.1) },
  },
  // BW and XY art sits inside a thin silver bevel; these are the art's inner edges, so the bevel stays unfoiled.
  bw: {
    basic: { art: R(8.9, 10.4, 90.2, 49.5) },
    stage: { art: R(8.9, 10.4, 90.2, 49.5), cuts: [cutRect(60, 11.6), cutEllipse(10.8, 13.2, 7.8, 5.6)] },
    trainer: { art: R(10.4, 16.2, 89.4, 50.9) },
  },
  xy: {
    basic: { art: R(9, 10.9, 90.3, 49.3) },
    stage: { art: R(9, 10.9, 90.3, 49.3), cuts: [cutRect(60, 11.5), cutEllipse(10.8, 13.3, 7.8, 5.8)] },
    trainer: { art: R(10.1, 16.1, 89.4, 51) },
  },
  sm: {
    basic: { art: R(5.4, 8.3, 94, 47.4) },
    stage: { art: R(5.4, 8.3, 94, 47.4), cuts: [cutRect(58, 10.4), cutRect(14.5, 19.2, 2.5)] },
    trainer: { art: R(5.4, 13, 93.9, 52.4) },
  },
  swsh: {
    basic: { art: R(7.8, 9.8, 92, 47.3) },
    stage: { art: R(7.8, 9.8, 92, 47.3), cuts: [cutRect(53, 11.9), cutRect(16.2, 19.2, 2)] },
    trainer: { art: R(7.8, 14.1, 92, 52.1) },
  },
  sv: {
    basic: { art: R(7.9, 9.8, 92.3, 47.2) },
    stage: { art: R(7.9, 9.8, 92.3, 47.2), cuts: [cutRect(66, 11.9), cutEllipse(9.8, 12, 7.8, 6.6)] },
    trainer: { art: R(8, 14.1, 92.9, 52.3) },
  },
  me: {
    basic: { art: R(7.9, 9.8, 92.3, 47.2) },
    stage: { art: R(7.9, 9.8, 92.3, 47.2), cuts: [cutRect(66, 11.6), cutEllipse(9.8, 12, 7.8, 6.6)] },
    trainer: { art: R(8, 14.1, 92.9, 52.3) },
  },
};

/** Card kind from TCGdex category and stage. Energy and unknowns use the Pokémon Basic window. */
export function cardKind(category?: string | null, stage?: string | null): CardKind {
  if (category === "Trainer") return "trainer";
  if (category === "Pokemon" && stage && /stage|vmax|vstar|mega|break|level/i.test(stage)) return "stage";
  return "basic";
}

/* ---------- SVG masks: a viewBox of 0–100 stretched over the card ---------- */

// Corner radius is % of width; scale it for height, as layouts.ts does.
const ASPECT = 600 / 825;
const rectEl = ({ x0, y0, x1, y1, r = 0 }: Rect, fill: string) =>
  `<rect x='${x0}' y='${y0}' width='${x1 - x0}' height='${y1 - y0}' rx='${r}' ry='${r * ASPECT}' fill='${fill}'/>`;
const cutEl = (c: Cut, fill: string) =>
  "rect" in c ? rectEl(c.rect, fill) : `<ellipse cx='${c.ellipse.cx}' cy='${c.ellipse.cy}' rx='${c.ellipse.rx}' ry='${c.ellipse.ry}' fill='${fill}'/>`;

const svgUrl = (body: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'>${body}</svg>`,
  )}")`;

/** CSS mask for the art window (holo foil). */
export function artWindowMask(shape: ArtShape): string {
  return svgUrl(`<mask id='m'>${rectEl(shape.art, "white")}${(shape.cuts ?? []).map((c) => cutEl(c, "black")).join("")}</mask><rect width='100' height='100' mask='url(#m)'/>`);
}

/** CSS mask for everything inside the border except the art window (reverse foil). The cut-outs
 *  (portraits, labels) are frame, so they get reverse foil. */
export function reverseWindowMask(shape: ArtShape, layout: FrameLayout): string {
  const { x, y } = layout.border;
  const inner = R(x, y, 100 - x, 100 - y, 2.5);
  const cuts = (shape.cuts ?? []).map((c) => cutEl(c, "white")).join("");
  return svgUrl(
    `<clipPath id='c'>${rectEl(inner, "white")}</clipPath>` +
      `<mask id='m'>${rectEl(inner, "white")}${rectEl(shape.art, "black")}${cuts}</mask>` +
      `<rect width='100' height='100' mask='url(#m)' clip-path='url(#c)'/>`,
  );
}

/** The window's rectangle and cut-outs, for the "Show art box" tuning overlay. */
export function windowOutline(shape: ArtShape): { rect: Rect; cuts: Cut[] } {
  return { rect: shape.art, cuts: shape.cuts ?? [] };
}

/** The window for a layout and card kind; layouts without measurements use the modern frame's. */
export function artWindow(layout: FrameLayout, kind: CardKind): ArtShape {
  return (ART_WINDOWS[layout.id] ?? ART_WINDOWS.me)[kind];
}
