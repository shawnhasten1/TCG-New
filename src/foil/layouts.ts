// Per-era card frame layouts, used to place holo foil on scans.
// Measured on 600×825 TCGdex scans (2026-09-22). All values are % of the card image.
// Tune them on the foil lab page (#/foil) with "Show art box" on.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Corner radius, % of card width. */
  r?: number;
}

export interface FrameLayout {
  id: string;
  name: string;
  /** TCGdex serie ids using this frame. */
  series: string[];
  /** The illustration window. Holo foil goes here; reverse holo goes everywhere else. */
  art: Box;
  /** Printed outer border (yellow/silver) that reverse foil leaves alone, % of width / height. */
  border: { x: number; y: number };
  /** A sample holo card from this era, for the foil lab. */
  sample: { image: string; name: string; rarity: string };
}

const box = (x0: number, y0: number, x1: number, y1: number, r = 0.6): Box => ({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, r });
const img = (path: string) => `https://assets.tcgdex.net/en/${path}`;

export const layouts: FrameLayout[] = [
  {
    id: "wotc",
    name: "WOTC (Base–Neo)",
    series: ["base", "gym", "neo", "lc", "si"],
    art: box(10.5, 11, 89, 50.5, 0.3),
    border: { x: 5, y: 3.6 },
    sample: { image: img("base/base1/1"), name: "Alakazam", rarity: "Rare" },
  },
  {
    id: "ecard",
    name: "e-Card",
    series: ["ecard"],
    art: box(9, 12.5, 96, 49.5, 3),
    // The e-Card art window runs into the right border.
    border: { x: 4, y: 3.6 },
    sample: { image: img("ecard/ecard1/1"), name: "Alakazam", rarity: "Holo Rare" },
  },
  {
    id: "ex",
    name: "EX / POP",
    series: ["ex", "pop"],
    art: box(9, 8, 92, 46),
    border: { x: 4.6, y: 3.4 },
    sample: { image: img("ex/ex1/1"), name: "Aggron", rarity: "Holo Rare" },
  },
  {
    id: "dp",
    name: "Diamond & Pearl / Platinum",
    series: ["dp", "pl"],
    art: box(7, 8.5, 94, 49),
    border: { x: 4.4, y: 3.2 },
    sample: { image: img("dp/dp1/1"), name: "Dialga", rarity: "Rare Holo" },
  },
  {
    id: "hgss",
    name: "HeartGold SoulSilver / Call of Legends",
    series: ["hgss", "col"],
    art: box(7, 9, 93, 52),
    border: { x: 4.4, y: 3.2 },
    sample: { image: img("hgss/hgss1/1"), name: "Arcanine", rarity: "Holo Rare" },
  },
  {
    id: "bw",
    name: "Black & White",
    series: ["bw"],
    art: box(8, 9.5, 92, 49, 0.4),
    border: { x: 4.4, y: 3.2 },
    sample: { image: img("bw/bw1/5"), name: "Serperior", rarity: "Rare" },
  },
  {
    id: "xy",
    name: "XY",
    series: ["xy"],
    art: box(8, 9.5, 92, 49, 0.4),
    border: { x: 4.4, y: 3.2 },
    sample: { image: img("xy/xy1/5"), name: "Beedrill", rarity: "Rare" },
  },
  {
    id: "sm",
    name: "Sun & Moon",
    series: ["sm"],
    art: box(5.6, 8, 92.2, 47.7),
    border: { x: 4.4, y: 3.2 },
    sample: { image: img("sm/sm1/3"), name: "Butterfree", rarity: "Rare" },
  },
  {
    id: "swsh",
    name: "Sword & Shield",
    series: ["swsh"],
    art: box(7.5, 9.3, 92.5, 47.7),
    border: { x: 4.4, y: 3.2 },
    sample: { image: img("swsh/swsh7/4"), name: "Jumpluff", rarity: "Holo Rare" },
  },
  {
    id: "sv",
    name: "Scarlet & Violet / Mega Evolution",
    series: ["sv", "me"],
    art: box(7.5, 9.3, 92.5, 47.7),
    border: { x: 4.4, y: 3.2 },
    sample: { image: img("sv/sv01/015"), name: "Meowscarada", rarity: "Rare" },
  },
];

const bySerie = new Map(layouts.flatMap((l) => l.series.map((s) => [s, l] as const)));

/** The frame layout for a serie, defaulting to the modern frame. */
export function layoutFor(serieId: string): FrameLayout {
  return bySerie.get(serieId) ?? layouts[layouts.length - 1];
}

const rect = ({ x, y, w, h, r = 0 }: Box) => {
  // Rounded rect as a path, in a 100×100 viewBox. Radius is % of width, so scale it for height.
  const rx = r;
  const ry = r * (600 / 825);
  return `M${x + rx},${y} h${w - 2 * rx} a${rx},${ry} 0 0 1 ${rx},${ry} v${h - 2 * ry} a${rx},${ry} 0 0 1 -${rx},${ry} h-${w - 2 * rx} a${rx},${ry} 0 0 1 -${rx},-${ry} v-${h - 2 * ry} a${rx},${ry} 0 0 1 ${rx},-${ry} z`;
};

const svgUrl = (d: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'><path fill='black' fill-rule='evenodd' d='${d}'/></svg>`,
  )}")`;

/** CSS mask covering the art box only. */
export function artMask(layout: FrameLayout): string {
  return svgUrl(rect(layout.art));
}

/** CSS mask covering the card inside its border, minus the art box. */
export function reverseMask(layout: FrameLayout): string {
  const { x, y } = layout.border;
  const inner = { x, y, w: 100 - 2 * x, h: 100 - 2 * y, r: 2.5 };
  return svgUrl(rect(inner) + " " + rect(layout.art));
}
