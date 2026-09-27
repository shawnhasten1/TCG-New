// The Magic: The Gathering sets packs come from, and how each era's boosters are made up and its foils look.
//
// Scryfall knows which printings come in a set's boosters (`is:booster`), but not the odds, so each set uses one of
// three pack profiles, run by the same engine as Pokémon (engine/openPack.ts): a slot's table picks a rarity, then a
// card of that rarity. Rarities are Scryfall's, spelled out (cards.ts), and basic lands have their own ("Basic Land")
// so they only come in the land slot.
//
// A set's booster era and foil era both follow from its release date, so adding a set is one line in MTG_SETS.
// Odds are rounded from Wizards' published collation where there is one, and community counts otherwise; tune them here.

import type { PackProfile, SlotProfile } from "../engine/types";

export type MtgEra = "classic" | "draft" | "play";

export interface MtgSet {
  /** Scryfall's set code, lowercase ("dsk"); also its id here. */
  id: string;
  name: string;
  /** Release date. */
  released: string;
}

export const MTG_ERAS: { id: MtgEra; name: string }[] = [
  { id: "play", name: "Play Boosters (2024–)" },
  { id: "draft", name: "Draft Boosters (2008–2023)" },
  { id: "classic", name: "Classic boosters (1993–2008)" },
];

/** Shards of Alara brought mythic rares and the basic land slot; Murders at Karlov Manor brought Play Boosters. */
export function boosterEra(set: Pick<MtgSet, "released">): MtgEra {
  if (set.released >= "2024-02-09") return "play";
  if (set.released >= "2008-10-03") return "draft";
  return "classic";
}

/**
 * How a set's foils look (the layouts in foil/layouts.ts):
 * - premodern: Urza's Legacy (the first foils, 1999) to Scourge. The shine is on the frame more than the art and text
 *   box, and a shooting star (Wizards' logo then) is stamped in the text box.
 * - modern: Eighth Edition (2003) on. The whole face shines, art and text box included.
 * - dark: Future Sight, Lorwyn and Shadowmoor's blocks, whose foils are noticeably darker than the rest.
 * Sets before Urza's Legacy have no foils at all (Scryfall says so per card), so their era never shows.
 */
export type MtgFoilEra = "premodern" | "modern" | "dark";

const DARK_FOILS = new Set(["fut", "lrw", "mor", "shm", "eve"]);

export function foilEra(set: Pick<MtgSet, "id" | "released">): MtgFoilEra {
  if (DARK_FOILS.has(set.id)) return "dark";
  return set.released < "2003-07-28" ? "premodern" : "modern";
}

export const MTG_SETS: MtgSet[] = [
  { id: "usg", name: "Urza's Saga", released: "1998-10-12" },
  { id: "ulg", name: "Urza's Legacy", released: "1999-02-15" },
  { id: "inv", name: "Invasion", released: "2000-10-02" },
  { id: "ody", name: "Odyssey", released: "2001-10-01" },
  { id: "ons", name: "Onslaught", released: "2002-10-07" },
  { id: "mrd", name: "Mirrodin", released: "2003-10-02" },
  { id: "lrw", name: "Lorwyn", released: "2007-10-12" },
  { id: "shm", name: "Shadowmoor", released: "2008-05-02" },
  { id: "isd", name: "Innistrad", released: "2011-09-30" },
  { id: "ktk", name: "Khans of Tarkir", released: "2014-09-26" },
  { id: "dom", name: "Dominaria", released: "2018-04-27" },
  { id: "eld", name: "Throne of Eldraine", released: "2019-10-04" },
  { id: "mkm", name: "Murders at Karlov Manor", released: "2024-02-09" },
  { id: "blb", name: "Bloomburrow", released: "2024-08-02" },
  { id: "dsk", name: "Duskmourn: House of Horror", released: "2024-09-27" },
  { id: "fdn", name: "Foundations", released: "2024-11-15" },
  { id: "dft", name: "Aetherdrift", released: "2025-02-14" },
];

export const mtgSet = (id: string) => MTG_SETS.find((s) => s.id === id);

const PLAIN = { normal: 1 };
const FOIL = { holo: 1 };

/**
 * The last common of a Draft Booster: foil about one pack in three, and a foil can be any rarity, roughly as often
 * as each is printed. The engine picks the rarity first, so the foil's share of each rarity is folded into its weight
 * and its finish odds.
 */
function commonOrFoil(foilChance: number, foilRarities: Record<string, number>): SlotProfile {
  const total = Object.values(foilRarities).reduce((a, b) => a + b, 0);
  const share = (r: string) => (foilChance * (foilRarities[r] ?? 0)) / total;
  const table: Record<string, number> = { Common: 1 - foilChance + share("Common") };
  const finishOverrides: Record<string, { normal?: number; holo?: number }> = { Common: { normal: 1 - foilChance, holo: share("Common") } };
  for (const r of Object.keys(foilRarities)) {
    if (r === "Common") continue;
    table[r] = share(r);
    finishOverrides[r] = FOIL;
  }
  return { label: "Common or foil", count: 1, table, finish: PLAIN, finishOverrides };
}

export const MTG_PROFILES: Record<MtgEra, PackProfile> = {
  // 15 cards: 11 commons, 3 uncommons, a rare. Foils (from Urza's Legacy on) came about one pack in 67; sets from
  // before have none, so the card comes out plain.
  classic: {
    id: "mtg-classic",
    name: "Magic booster, 1993–2008",
    series: ["mtg"],
    variantsKnown: true,
    slots: [
      { label: "Common", count: 10, table: { Common: 1 }, finish: PLAIN },
      commonOrFoil(1 / 67, { Common: 11, Uncommon: 3, Rare: 1 }),
      { label: "Uncommon", count: 3, table: { Uncommon: 1 }, finish: PLAIN },
      { label: "Rare", count: 1, table: { Rare: 1 }, finish: PLAIN },
    ],
  },
  // 15 cards: a basic land, 10 commons (one of them sometimes a foil of any rarity), 3 uncommons, and a rare that's
  // mythic one time in eight.
  draft: {
    id: "mtg-draft",
    name: "Magic Draft Booster",
    series: ["mtg"],
    variantsKnown: true,
    slots: [
      { label: "Basic land", count: 1, table: { "Basic Land": 1 }, finish: PLAIN },
      { label: "Common", count: 9, table: { Common: 1 }, finish: PLAIN },
      commonOrFoil(1 / 3, { Common: 70, Uncommon: 20, Rare: 8.5, "Mythic Rare": 1.5 }),
      { label: "Uncommon", count: 3, table: { Uncommon: 1 }, finish: PLAIN },
      { label: "Rare", count: 1, table: { Rare: 7, "Mythic Rare": 1 }, finish: PLAIN },
    ],
  },
  // 14 cards: 7 commons, 3 uncommons, a land (foil one time in five), a wildcard of any rarity, a foil of any rarity,
  // and a rare that's mythic one time in seven. The seventh common is sometimes a Special Guest or a card from The
  // List instead; those are other sets, so it's always a common here.
  play: {
    id: "mtg-play",
    name: "Magic Play Booster",
    series: ["mtg"],
    variantsKnown: true,
    slots: [
      { label: "Common", count: 7, table: { Common: 1 }, finish: PLAIN },
      { label: "Uncommon", count: 3, table: { Uncommon: 1 }, finish: PLAIN },
      { label: "Land", count: 1, table: { "Basic Land": 1 }, finish: { normal: 4, holo: 1 } },
      { label: "Wildcard", count: 1, table: { Common: 16.7, Uncommon: 58.3, Rare: 20.8, "Mythic Rare": 4.2 }, finish: PLAIN },
      { label: "Foil", count: 1, table: { Common: 58.3, Uncommon: 33.3, Rare: 6.7, "Mythic Rare": 1.7 }, finish: FOIL },
      { label: "Rare", count: 1, table: { Rare: 6, "Mythic Rare": 1 }, finish: PLAIN },
    ],
  },
};

export const mtgProfile = (set: MtgSet) => MTG_PROFILES[boosterEra(set)];
