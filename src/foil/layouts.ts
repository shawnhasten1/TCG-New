// Per-era card frame layouts: the border reverse foil leaves alone, and each era's holo and reverse patterns.
// Where the art sits, per card kind, is in artWindows.ts. All values are % of the card image.

import type { ReversePattern } from "./reverse";
import type { Tint, Treatment } from "./treatment";
import { mtgFoil } from "../mtg/foil";
import type { MtgFoilEra } from "../mtg/sets";
import { ygoFoil } from "../ygo/foil";

/** Art-box holo patterns for regular holo rares, after the physical cards of each era (see foil.css). */
export type HoloPattern = "smooth" | "cosmos" | "cracked" | "starlight" | "sheen" | "tinsel" | "waterweb";

/** How a foil card looks in a game whose foils don't follow Pokémon's rules (see FrameLayout.rarityFoil). */
export interface RarityFoil {
  treatment: Treatment;
  holo?: HoloPattern;
  tint?: Tint;
  /** A variant of the treatment for this era, styled in foil.css (data-foil-era), e.g. Magic's "premodern" or "dark". */
  era?: string;
  /** A mark stamped on foil cards only: Magic's pre-2003 shooting star. */
  mark?: "star";
}

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
  /** For games whose foils don't follow Pokémon's rules (Magic, Yu-Gi-Oh!): the treatment and pattern for a foil card of a rarity. */
  rarityFoil?(rarity: string): RarityFoil | undefined;
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

/**
 * Magic's foil eras (mtg/sets.ts foilEra), one layout each; a set's serie id is "mtg-<era>" (mtg/cards.ts). Not in
 * `layouts`, whose rows the foil lab draws from Pokémon samples: the lab's Magic section shows these, and only where
 * Magic is switched on, since their images come through the Worker. Art windows are in artWindows.ts.
 */
const mtgLayout = (era: MtgFoilEra, name: string, border: FrameLayout["border"], sample: { id: string; name: string }): FrameLayout => ({
  id: `mtg-${era}`,
  name,
  series: [`mtg-${era}`],
  border,
  reverse: "plain",
  holo: "smooth",
  sample: { image: `/api/mtg/card/${sample.id}`, name: sample.name, rarity: "Common", types: [], stage: "Basic" },
  rarityFoil: () => mtgFoil(era),
});

export const MTG_LAYOUTS: Record<MtgFoilEra, FrameLayout> = {
  premodern: mtgLayout("premodern", "Magic, 1999–2003 (old frame)", { x: 4.7, y: 3.5 }, { id: "9561ffdb-f4dd-4b62-a2c2-933498e3a061", name: "Aegis of Honor" }),
  modern: mtgLayout("modern", "Magic, 2003 on", { x: 4.5, y: 3.2 }, { id: "6f1a7590-3eee-4803-b192-d4fb771e6a86", name: "Acrobatic Cheerleader" }),
  dark: mtgLayout("dark", "Magic, Future Sight to Shadowmoor", { x: 4.5, y: 3.2 }, { id: "2a1470a6-d09d-4a2a-84a6-d56e32ed237a", name: "Ajani Goldmane" }),
};

/** Every Yu-Gi-Oh! set, whose serie id is "ygo" (ygo/cards.ts). Its foil comes from the rarity (ygo/foil.ts). */
export const YGO_LAYOUT: FrameLayout = {
  id: "ygo",
  name: "Yu-Gi-Oh!",
  series: ["ygo"],
  border: { x: 3.5, y: 2.5 },
  reverse: "plain",
  holo: "smooth",
  sample: { image: "/api/ygo/card/LOB/89631139", name: "Blue-Eyes White Dragon", rarity: "Ultra Rare", types: [], stage: "Basic" },
  rarityFoil: ygoFoil,
};

const bySerie = new Map([...layouts, ...Object.values(MTG_LAYOUTS), YGO_LAYOUT].flatMap((l) => l.series.map((s) => [s, l] as const)));
const MODERN = layouts.find((l) => l.id === "me")!;

/** The frame layout for a serie, defaulting to the modern Pokémon frame. */
export function layoutFor(serieId: string): FrameLayout {
  return bySerie.get(serieId) ?? MODERN;
}
