// The Magic: The Gathering sets packs come from, and how each era's boosters are made up and its foils look.
//
// Scryfall knows which printings come in a set's boosters (`is:booster`), but not the odds, so each set uses one of
// three pack profiles (or, for a few, one of OTHER_PROFILES), run by the same engine as Pokémon (engine/openPack.ts):
// a slot's table picks a rarity, then a card of that rarity. Rarities are Scryfall's, spelled out (cards.ts), and basic lands have their own ("Basic Land")
// so they only come in the land slot. Smaller sets with no basic lands of their own put a common there instead.
//
// A set's booster era and foil era both follow from its release date, so adding a set is one line in MTG_SETS.
//
// MTG_SETS is every paper set Wizards sold in random boosters, from Scryfall's set list (core, expansion, masters,
// draft innovation, Un-sets, and Portal and Starter 1999). Left out: decks and box products (Jumpstart, Clash Packs,
// Welcome Decks, Clue Edition), sheets that only came inside another set's boosters (Time Spiral Timeshifted, The Big
// Score, the Modern Horizons Timeshifts), March of the Machine: The Aftermath's 5-card packs, and sets gathered from
// all over (The List, Mystery Booster 2). A few sets' boosters have profiles of their own (OTHER_PROFILES); other
// special boosters, like Commander Legends' 20 cards, come out as their era's usual pack.
// Odds are rounded from Wizards' published collation where there is one, and community counts otherwise; tune them here.

import type { SetTier } from "../engine/setRarity";
import type { PackProfile, SlotProfile } from "../engine/types";
import rarity from "./setRarity.json";

export type MtgEra = "classic" | "draft" | "play";

export interface MtgSet {
  /** Scryfall's set code, lowercase ("dsk"); also its id here. */
  id: string;
  name: string;
  /** Release date. */
  released: string;
  /** For sets whose boosters weren't their era's usual ones: which of OTHER_PROFILES they were instead. */
  pack?: OtherPack;
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
  { id: "lea", name: "Limited Edition Alpha", released: "1993-08-05" },
  { id: "leb", name: "Limited Edition Beta", released: "1993-10-04" },
  { id: "2ed", name: "Unlimited Edition", released: "1993-12-01" },
  { id: "arn", name: "Arabian Nights", released: "1993-12-17", pack: "small8" },
  { id: "atq", name: "Antiquities", released: "1994-03-04", pack: "small8" },
  { id: "3ed", name: "Revised Edition", released: "1994-04-11" },
  { id: "leg", name: "Legends", released: "1994-06-01" },
  { id: "drk", name: "The Dark", released: "1994-08-01", pack: "small8" },
  { id: "fem", name: "Fallen Empires", released: "1994-11-01", pack: "small8" },
  { id: "4ed", name: "Fourth Edition", released: "1995-04-01" },
  { id: "ice", name: "Ice Age", released: "1995-06-03" },
  { id: "chr", name: "Chronicles", released: "1995-07-01", pack: "small12" },
  { id: "ren", name: "Renaissance", released: "1995-08-01", pack: "small8" },
  { id: "hml", name: "Homelands", released: "1995-10-01", pack: "small8" },
  { id: "all", name: "Alliances", released: "1996-06-10", pack: "small12" },
  { id: "mir", name: "Mirage", released: "1996-10-08" },
  { id: "vis", name: "Visions", released: "1997-02-03" },
  { id: "5ed", name: "Fifth Edition", released: "1997-03-24" },
  { id: "por", name: "Portal", released: "1997-05-01" },
  { id: "wth", name: "Weatherlight", released: "1997-06-09" },
  { id: "tmp", name: "Tempest", released: "1997-10-14" },
  { id: "sth", name: "Stronghold", released: "1998-03-02" },
  { id: "exo", name: "Exodus", released: "1998-06-15" },
  { id: "p02", name: "Portal Second Age", released: "1998-06-24" },
  { id: "ugl", name: "Unglued", released: "1998-08-11" },
  { id: "usg", name: "Urza's Saga", released: "1998-10-12" },
  { id: "ulg", name: "Urza's Legacy", released: "1999-02-15" },
  { id: "6ed", name: "Classic Sixth Edition", released: "1999-04-21" },
  { id: "ptk", name: "Portal Three Kingdoms", released: "1999-05-01" },
  { id: "uds", name: "Urza's Destiny", released: "1999-06-07" },
  { id: "s99", name: "Starter 1999", released: "1999-07-01" },
  { id: "mmq", name: "Mercadian Masques", released: "1999-10-04" },
  { id: "nem", name: "Nemesis", released: "2000-02-14" },
  { id: "pcy", name: "Prophecy", released: "2000-06-05" },
  { id: "inv", name: "Invasion", released: "2000-10-02" },
  { id: "pls", name: "Planeshift", released: "2001-02-05" },
  { id: "7ed", name: "Seventh Edition", released: "2001-04-11" },
  { id: "apc", name: "Apocalypse", released: "2001-06-04" },
  { id: "ody", name: "Odyssey", released: "2001-10-01" },
  { id: "tor", name: "Torment", released: "2002-02-04" },
  { id: "jud", name: "Judgment", released: "2002-05-27" },
  { id: "ons", name: "Onslaught", released: "2002-10-07" },
  { id: "lgn", name: "Legions", released: "2003-02-03" },
  { id: "scg", name: "Scourge", released: "2003-05-26" },
  { id: "8ed", name: "Eighth Edition", released: "2003-07-28" },
  { id: "mrd", name: "Mirrodin", released: "2003-10-02" },
  { id: "dst", name: "Darksteel", released: "2004-02-06" },
  { id: "5dn", name: "Fifth Dawn", released: "2004-06-04" },
  { id: "chk", name: "Champions of Kamigawa", released: "2004-10-01" },
  { id: "unh", name: "Unhinged", released: "2004-11-19" },
  { id: "bok", name: "Betrayers of Kamigawa", released: "2005-02-04" },
  { id: "sok", name: "Saviors of Kamigawa", released: "2005-06-03" },
  { id: "9ed", name: "Ninth Edition", released: "2005-07-29" },
  { id: "rav", name: "Ravnica: City of Guilds", released: "2005-10-07" },
  { id: "gpt", name: "Guildpact", released: "2006-02-03" },
  { id: "dis", name: "Dissension", released: "2006-05-05" },
  { id: "csp", name: "Coldsnap", released: "2006-07-21" },
  { id: "tsp", name: "Time Spiral", released: "2006-10-06" },
  { id: "plc", name: "Planar Chaos", released: "2007-02-02" },
  { id: "fut", name: "Future Sight", released: "2007-05-04" },
  { id: "10e", name: "Tenth Edition", released: "2007-07-13" },
  { id: "lrw", name: "Lorwyn", released: "2007-10-12" },
  { id: "mor", name: "Morningtide", released: "2008-02-01" },
  { id: "shm", name: "Shadowmoor", released: "2008-05-02" },
  { id: "eve", name: "Eventide", released: "2008-07-25" },
  { id: "ala", name: "Shards of Alara", released: "2008-10-03" },
  { id: "con", name: "Conflux", released: "2009-02-06" },
  { id: "arb", name: "Alara Reborn", released: "2009-04-30" },
  { id: "m10", name: "Magic 2010", released: "2009-07-17" },
  { id: "zen", name: "Zendikar", released: "2009-10-02" },
  { id: "wwk", name: "Worldwake", released: "2010-02-05" },
  { id: "roe", name: "Rise of the Eldrazi", released: "2010-04-23" },
  { id: "m11", name: "Magic 2011", released: "2010-07-16" },
  { id: "som", name: "Scars of Mirrodin", released: "2010-10-01" },
  { id: "mbs", name: "Mirrodin Besieged", released: "2011-02-04" },
  { id: "nph", name: "New Phyrexia", released: "2011-05-13" },
  { id: "m12", name: "Magic 2012", released: "2011-07-15" },
  { id: "isd", name: "Innistrad", released: "2011-09-30" },
  { id: "dka", name: "Dark Ascension", released: "2012-02-03" },
  { id: "avr", name: "Avacyn Restored", released: "2012-05-04" },
  { id: "m13", name: "Magic 2013", released: "2012-07-13" },
  { id: "rtr", name: "Return to Ravnica", released: "2012-10-05" },
  { id: "gtc", name: "Gatecrash", released: "2013-02-01" },
  { id: "dgm", name: "Dragon's Maze", released: "2013-05-03" },
  { id: "mma", name: "Modern Masters", released: "2013-06-07" },
  { id: "m14", name: "Magic 2014", released: "2013-07-19" },
  { id: "ths", name: "Theros", released: "2013-09-27" },
  { id: "bng", name: "Born of the Gods", released: "2014-02-07" },
  { id: "jou", name: "Journey into Nyx", released: "2014-05-02" },
  { id: "cns", name: "Conspiracy", released: "2014-06-06" },
  { id: "m15", name: "Magic 2015", released: "2014-07-18" },
  { id: "ktk", name: "Khans of Tarkir", released: "2014-09-26" },
  { id: "frf", name: "Fate Reforged", released: "2015-01-23" },
  { id: "dtk", name: "Dragons of Tarkir", released: "2015-03-27" },
  { id: "mm2", name: "Modern Masters 2015", released: "2015-05-22" },
  { id: "ori", name: "Magic Origins", released: "2015-07-17" },
  { id: "bfz", name: "Battle for Zendikar", released: "2015-10-02" },
  { id: "ogw", name: "Oath of the Gatewatch", released: "2016-01-22" },
  { id: "soi", name: "Shadows over Innistrad", released: "2016-04-08" },
  { id: "ema", name: "Eternal Masters", released: "2016-06-10" },
  { id: "emn", name: "Eldritch Moon", released: "2016-07-22" },
  { id: "cn2", name: "Conspiracy: Take the Crown", released: "2016-08-26" },
  { id: "kld", name: "Kaladesh", released: "2016-09-30" },
  { id: "aer", name: "Aether Revolt", released: "2017-01-20" },
  { id: "mm3", name: "Modern Masters 2017", released: "2017-03-17" },
  { id: "akh", name: "Amonkhet", released: "2017-04-28" },
  { id: "hou", name: "Hour of Devastation", released: "2017-07-14" },
  { id: "xln", name: "Ixalan", released: "2017-09-29" },
  { id: "ima", name: "Iconic Masters", released: "2017-11-17" },
  { id: "ust", name: "Unstable", released: "2017-12-08" },
  { id: "rix", name: "Rivals of Ixalan", released: "2018-01-19" },
  { id: "a25", name: "Masters 25", released: "2018-03-16" },
  { id: "dom", name: "Dominaria", released: "2018-04-27" },
  { id: "bbd", name: "Battlebond", released: "2018-06-08" },
  { id: "m19", name: "Core Set 2019", released: "2018-07-13" },
  { id: "grn", name: "Guilds of Ravnica", released: "2018-10-05" },
  { id: "uma", name: "Ultimate Masters", released: "2018-12-07" },
  { id: "rna", name: "Ravnica Allegiance", released: "2019-01-25" },
  { id: "war", name: "War of the Spark", released: "2019-05-03" },
  { id: "mh1", name: "Modern Horizons", released: "2019-06-14" },
  { id: "m20", name: "Core Set 2020", released: "2019-07-12" },
  { id: "eld", name: "Throne of Eldraine", released: "2019-10-04" },
  { id: "thb", name: "Theros Beyond Death", released: "2020-01-24" },
  { id: "iko", name: "Ikoria: Lair of Behemoths", released: "2020-04-24" },
  { id: "m21", name: "Core Set 2021", released: "2020-07-03" },
  { id: "2xm", name: "Double Masters", released: "2020-08-07" },
  { id: "znr", name: "Zendikar Rising", released: "2020-09-25" },
  { id: "cmr", name: "Commander Legends", released: "2020-11-20" },
  { id: "khm", name: "Kaldheim", released: "2021-02-05" },
  { id: "tsr", name: "Time Spiral Remastered", released: "2021-03-19" },
  { id: "stx", name: "Strixhaven: School of Mages", released: "2021-04-23" },
  { id: "mh2", name: "Modern Horizons 2", released: "2021-06-18" },
  { id: "afr", name: "Adventures in the Forgotten Realms", released: "2021-07-23" },
  { id: "mid", name: "Innistrad: Midnight Hunt", released: "2021-09-24" },
  { id: "vow", name: "Innistrad: Crimson Vow", released: "2021-11-19" },
  { id: "dbl", name: "Innistrad: Double Feature", released: "2022-01-28" },
  { id: "neo", name: "Kamigawa: Neon Dynasty", released: "2022-02-18" },
  { id: "snc", name: "Streets of New Capenna", released: "2022-04-29" },
  { id: "clb", name: "Commander Legends: Battle for Baldur's Gate", released: "2022-06-10" },
  { id: "2x2", name: "Double Masters 2022", released: "2022-07-08" },
  { id: "dmu", name: "Dominaria United", released: "2022-09-09" },
  { id: "unf", name: "Unfinity", released: "2022-10-07" },
  { id: "bro", name: "The Brothers' War", released: "2022-11-18" },
  { id: "dmr", name: "Dominaria Remastered", released: "2023-01-13" },
  { id: "one", name: "Phyrexia: All Will Be One", released: "2023-02-10" },
  { id: "mom", name: "March of the Machine", released: "2023-04-21" },
  { id: "ltr", name: "The Lord of the Rings: Tales of Middle-earth", released: "2023-06-23" },
  { id: "cmm", name: "Commander Masters", released: "2023-08-04" },
  { id: "woe", name: "Wilds of Eldraine", released: "2023-09-08" },
  { id: "lci", name: "The Lost Caverns of Ixalan", released: "2023-11-17" },
  { id: "rvr", name: "Ravnica Remastered", released: "2024-01-12" },
  { id: "mkm", name: "Murders at Karlov Manor", released: "2024-02-09" },
  { id: "otj", name: "Outlaws of Thunder Junction", released: "2024-04-19" },
  { id: "mh3", name: "Modern Horizons 3", released: "2024-06-14" },
  { id: "acr", name: "Assassin's Creed", released: "2024-07-05", pack: "beyond" },
  { id: "blb", name: "Bloomburrow", released: "2024-08-02" },
  { id: "dsk", name: "Duskmourn: House of Horror", released: "2024-09-27" },
  { id: "fdn", name: "Foundations", released: "2024-11-15" },
  { id: "inr", name: "Innistrad Remastered", released: "2025-01-24" },
  { id: "dft", name: "Aetherdrift", released: "2025-02-14" },
  { id: "tdm", name: "Tarkir: Dragonstorm", released: "2025-04-11" },
  { id: "fin", name: "Final Fantasy", released: "2025-06-13" },
  { id: "eoe", name: "Edge of Eternities", released: "2025-08-01" },
  { id: "spm", name: "Marvel's Spider-Man", released: "2025-09-26" },
  { id: "tla", name: "Avatar: The Last Airbender", released: "2025-11-21" },
  { id: "ecl", name: "Lorwyn Eclipsed", released: "2026-01-23" },
  { id: "tmt", name: "Teenage Mutant Ninja Turtles", released: "2026-03-06" },
  { id: "sos", name: "Secrets of Strixhaven", released: "2026-04-24" },
  { id: "msh", name: "Marvel Super Heroes", released: "2026-06-26" },
  { id: "hob", name: "The Hobbit", released: "2026-08-14" },
];

export const mtgSet = (id: string) => MTG_SETS.find((s) => s.id === id);

/** Changes whenever MTG_SETS does, so what's cached about the set list (in D1 and on the device) is looked up again. */
export const MTG_SETS_SIGNATURE = (() => {
  let h = 0;
  for (const c of MTG_SETS.map((s) => s.id).join(",")) h = (h * 31 + c.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
})();

/** The sets packs are drawn from, limited to `eras` (booster eras; empty means every era). */
export function mtgDrawableSets(eras: readonly string[] = []): MtgSet[] {
  return eras.length ? MTG_SETS.filter((s) => eras.includes(boosterEra(s))) : MTG_SETS;
}

const tiers = (rarity as { sets: Record<string, { tier: SetTier }> }).sets;

/** How scarce a set's packs are (scripts/mtgSetRarity.ts); sets without market data count as "common". */
export const mtgSetTier = (id: string): SetTier => tiers[id]?.tier ?? "common";

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
      { label: "Basic land", count: 1, table: { "Basic Land": 1 }, fallback: { Common: 1 }, finish: PLAIN },
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
      { label: "Land", count: 1, table: { "Basic Land": 1 }, fallback: { Common: 1 }, finish: { normal: 4, holo: 1 } },
      { label: "Wildcard", count: 1, table: { Common: 16.7, Uncommon: 58.3, Rare: 20.8, "Mythic Rare": 4.2 }, finish: PLAIN },
      { label: "Foil", count: 1, table: { Common: 58.3, Uncommon: 33.3, Rare: 6.7, "Mythic Rare": 1.7 }, finish: FOIL },
      { label: "Rare", count: 1, table: { Rare: 6, "Mythic Rare": 1 }, finish: PLAIN },
    ],
  },
};

export type OtherPack = "small8" | "small12" | "beyond";

/**
 * Boosters unlike their era's:
 * - small8: Arabian Nights to Homelands, and Renaissance, 8 cards: 6 commons and 2 from the uncommon sheet, which
 *   rares (Scryfall's rarity for the scarcer uncommons) were on too.
 * - small12: Chronicles and Alliances, 12 cards: 8 commons, 3 uncommons and a rare.
 * - beyond: Assassin's Creed's 7-card Beyond Boosters, which have no commons but basic lands: 3 uncommons, a land
 *   (foil one time in five), a wildcard, a foil of any rarity, and a rare that's mythic one time in seven.
 */
export const OTHER_PROFILES: Record<OtherPack, PackProfile> = {
  small8: {
    id: "mtg-classic-8",
    name: "Magic booster, 8 cards",
    series: ["mtg"],
    variantsKnown: true,
    slots: [
      { label: "Common", count: 6, table: { Common: 1 }, finish: PLAIN },
      { label: "Uncommon", count: 2, table: { Uncommon: 3, Rare: 1 }, finish: PLAIN },
    ],
  },
  small12: {
    id: "mtg-classic-12",
    name: "Magic booster, 12 cards",
    series: ["mtg"],
    variantsKnown: true,
    slots: [
      { label: "Common", count: 8, table: { Common: 1 }, finish: PLAIN },
      { label: "Uncommon", count: 3, table: { Uncommon: 1 }, finish: PLAIN },
      { label: "Rare", count: 1, table: { Rare: 1 }, finish: PLAIN },
    ],
  },
  beyond: {
    id: "mtg-beyond",
    name: "Magic Beyond Booster",
    series: ["mtg"],
    variantsKnown: true,
    slots: [
      { label: "Uncommon", count: 3, table: { Uncommon: 1 }, finish: PLAIN },
      { label: "Land", count: 1, table: { "Basic Land": 1 }, fallback: { Common: 1 }, finish: { normal: 4, holo: 1 } },
      { label: "Wildcard", count: 1, table: { Uncommon: 70, Rare: 25, "Mythic Rare": 5 }, finish: PLAIN },
      { label: "Foil", count: 1, table: { Uncommon: 75, Rare: 20, "Mythic Rare": 5 }, finish: FOIL },
      { label: "Rare", count: 1, table: { Rare: 6, "Mythic Rare": 1 }, finish: PLAIN },
    ],
  },
};

export const mtgProfile = (set: MtgSet) => (set.pack ? OTHER_PROFILES[set.pack] : MTG_PROFILES[boosterEra(set)]);
