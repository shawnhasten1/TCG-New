// Per-era card frame layouts: the border reverse foil leaves alone, and each era's holo and reverse patterns.
// Where the art sits, per card kind, is in artWindows.ts. All values are % of the card image.

import type { ReversePattern } from "./reverse";

/** Art-box holo patterns for regular holo rares, after the physical cards of each era (see foil.css). */
export type HoloPattern = "smooth" | "cosmos" | "cracked" | "starlight" | "sheen" | "tinsel" | "waterweb";

export interface FrameLayout {
  id: string;
  name: string;
  /** TCGdex serie ids using this frame. */
  series: string[];
  /** Printed outer border (yellow/silver) that reverse foil leaves alone, % of width / height. */
  border: { x: number; y: number };
  /** The era's reverse holo pattern (see reverse.ts). */
  reverse: ReversePattern;
  /** The era's holo rare pattern. Collector guides: WOTC starlight, EX–HGSS cosmos, BW tinsel, XY sheen,
   *  SM water web; no source found for e-Card or from Sword & Shield on, so those are a smooth rainbow. */
  holo: HoloPattern;
  /** A sample holo card from this era, for the foil lab. */
  sample: { image: string; name: string; rarity: string; types: string[]; stage: string };
}

const img = (path: string) => `https://assets.tcgdex.net/en/${path}`;

export const layouts: FrameLayout[] = [
  {
    id: "wotc",
    name: "WOTC (Base–Neo)",
    series: ["base", "gym", "neo", "lc", "si"],
    border: { x: 5, y: 3.6 },
    reverse: "fireworks",
    holo: "starlight",
    sample: { image: img("base/base1/1"), name: "Alakazam", rarity: "Rare", types: ["Psychic"], stage: "Stage2" },
  },
  {
    id: "ecard",
    name: "e-Card",
    series: ["ecard"],
    border: { x: 4, y: 3.6 },
    reverse: "plain",
    holo: "smooth",
    sample: { image: img("ecard/ecard1/1"), name: "Alakazam", rarity: "Holo Rare", types: ["Psychic"], stage: "Stage2" },
  },
  {
    id: "ex",
    name: "EX / POP",
    series: ["ex", "pop"],
    border: { x: 4.6, y: 3.4 },
    reverse: "plain",
    holo: "cosmos",
    sample: { image: img("ex/ex1/1"), name: "Aggron", rarity: "Holo Rare", types: ["Metal"], stage: "Stage2" },
  },
  {
    id: "dp",
    name: "Diamond & Pearl / Platinum",
    series: ["dp", "pl"],
    border: { x: 4.4, y: 3.2 },
    reverse: "plain",
    holo: "cosmos",
    sample: { image: img("dp/dp1/1"), name: "Dialga", rarity: "Rare Holo", types: ["Metal"], stage: "Basic" },
  },
  {
    id: "hgss",
    name: "HeartGold SoulSilver / Call of Legends",
    series: ["hgss", "col"],
    border: { x: 4.4, y: 3.2 },
    reverse: "plain",
    holo: "cosmos",
    sample: { image: img("hgss/hgss1/1"), name: "Arcanine", rarity: "Holo Rare", types: ["Fire"], stage: "Stage1" },
  },
  {
    id: "bw",
    name: "Black & White",
    series: ["bw"],
    border: { x: 4.4, y: 3.2 },
    reverse: "plain",
    holo: "tinsel",
    sample: { image: img("bw/bw1/5"), name: "Serperior", rarity: "Rare", types: ["Grass"], stage: "Stage2" },
  },
  {
    id: "xy",
    name: "XY",
    series: ["xy"],
    border: { x: 4.4, y: 3.2 },
    reverse: "xy",
    holo: "sheen",
    sample: { image: img("xy/xy1/5"), name: "Beedrill", rarity: "Rare", types: ["Grass"], stage: "Stage2" },
  },
  {
    id: "sm",
    name: "Sun & Moon",
    series: ["sm"],
    border: { x: 4.4, y: 3.2 },
    reverse: "sm",
    holo: "waterweb",
    sample: { image: img("sm/sm1/3"), name: "Butterfree", rarity: "Rare", types: ["Grass"], stage: "Stage2" },
  },
  {
    id: "swsh",
    name: "Sword & Shield",
    series: ["swsh"],
    border: { x: 4.4, y: 3.2 },
    reverse: "swsh",
    holo: "smooth",
    sample: { image: img("swsh/swsh7/4"), name: "Jumpluff", rarity: "Holo Rare", types: ["Grass"], stage: "Stage2" },
  },
  {
    id: "sv",
    name: "Scarlet & Violet",
    series: ["sv"],
    border: { x: 4.4, y: 3.2 },
    reverse: "sv",
    holo: "smooth",
    sample: { image: img("sv/sv01/015"), name: "Meowscarada", rarity: "Rare", types: ["Grass"], stage: "Stage2" },
  },
  {
    // Same frame as Scarlet & Violet, but reverse holos went back to a plain background.
    id: "me",
    name: "Mega Evolution",
    series: ["me"],
    border: { x: 4.4, y: 3.2 },
    reverse: "plain",
    holo: "smooth",
    sample: { image: img("me/me01/001"), name: "Bulbasaur", rarity: "Common", types: ["Grass"], stage: "Basic" },
  },
];

const bySerie = new Map(layouts.flatMap((l) => l.series.map((s) => [s, l] as const)));

/** The frame layout for a serie, defaulting to the modern frame. */
export function layoutFor(serieId: string): FrameLayout {
  return bySerie.get(serieId) ?? layouts[layouts.length - 1];
}
