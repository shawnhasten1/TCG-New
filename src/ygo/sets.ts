// The Yu-Gi-Oh! sets packs come from, and how each kind of pack is made up.
//
// YGO_SETS is every English (TCG) set Konami sold in random booster packs, from YGOPRODeck's set list: core
// boosters from Legend of Blue Eyes White Dragon on, the smaller boosters between them (The Secret Forces to Phantom
// Revenge), Duelist Packs, Legendary Duelists, Hidden Arsenal, Dragons of Legend, Battles of Legend, the Maze sets,
// the Rarity Collections, Duel Terminal, Star Packs, Battle Packs, Retro Packs and a few one-offs (Ra Yellow Mega Pack,
// Number Hunters, World Superstars, Millennium Pack, the Dark Side of Dimensions Movie Pack, King's Court). Left out:
// structure and starter decks, tins, boxed sets whose packs only came inside the box (Legendary Collections, Gold
// Series, Premium Gold, Maximum Gold, Legendary Decks, Duel Power), Speed Duel, prize and tournament packs (Champion,
// Turbo, Astral), sneak peek and special edition promos, and the 25th Anniversary reprints of the first sets.
//
// YGOPRODeck lists products without saying what kind each is, so the list is by hand; the set's code is its id.
// A set's pack is its era's core booster unless `pack` says it's one of OTHER_PROFILES. Each is run by the same engine
// as Pokémon (engine/openPack.ts): a slot's table picks a rarity, then a card of that rarity. Rarities a set doesn't
// have drop out of a table and the rest scale up, so one table serves every set of a kind: Ultimate Rares only turn
// up in 2004–2015 sets, Quarter Century Secret Rares in 2023–2025 ones. Rarities are YGOPRODeck's (cards.ts).
// Odds are community estimates per 24-pack box; tune them here.

import type { SetTier } from "../engine/setRarity";
import type { PackProfile, SlotProfile } from "../engine/types";
import rarity from "./setRarity.json";

export type YgoEra = "dm" | "gx" | "5ds" | "zexal" | "arcv" | "vrains" | "modern";

export interface YgoSet {
  /** The set's code (on every card, like "PHNI-EN059"); also its id here. */
  id: string;
  name: string;
  /** YGOPRODeck's names for the set, when its cards are listed under others ("Duel Terminal 5a" and "5b"). */
  sources?: string[];
  /** TCG release date. */
  released: string;
  /** For sets that aren't core boosters: which of OTHER_PROFILES their packs are. */
  pack?: OtherPack;
}

/** The anime series each set came out alongside, newest first, for limiting which sets packs come from. */
export const YGO_ERAS: { id: YgoEra; name: string; from: string }[] = [
  { id: "modern", name: "Modern (2020–)", from: "2020-04-30" },
  { id: "vrains", name: "VRAINS (2017–2020)", from: "2017-08-03" },
  { id: "arcv", name: "ARC-V (2014–2017)", from: "2014-08-14" },
  { id: "zexal", name: "ZEXAL (2011–2014)", from: "2011-08-16" },
  { id: "5ds", name: "5D's (2008–2011)", from: "2008-09-02" },
  { id: "gx", name: "GX (2005–2008)", from: "2005-11-16" },
  { id: "dm", name: "Duel Monsters (2002–2005)", from: "" },
];

export const ygoEra = (set: Pick<YgoSet, "released">): YgoEra => YGO_ERAS.find((e) => set.released >= e.from)!.id;

export const YGO_SETS: YgoSet[] = [
  { id: "LOB", name: "Legend of Blue Eyes White Dragon", released: "2002-03-08" },
  { id: "MRD", name: "Metal Raiders", released: "2002-06-26" },
  { id: "SRL", name: "Spell Ruler", released: "2002-09-16" },
  { id: "PSV", name: "Pharaoh's Servant", released: "2002-10-20" },
  { id: "LON", name: "Labyrinth of Nightmare", released: "2003-03-01" },
  { id: "LOD", name: "Legacy of Darkness", released: "2003-06-06" },
  { id: "PGD", name: "Pharaonic Guardian", released: "2003-07-18" },
  { id: "MFC", name: "Magician's Force", released: "2003-10-10" },
  { id: "DCR", name: "Dark Crisis", released: "2003-12-01" },
  { id: "IOC", name: "Invasion of Chaos", released: "2004-03-01" },
  { id: "AST", name: "Ancient Sanctuary", released: "2004-06-01" },
  { id: "SOD", name: "Soul of the Duelist", released: "2004-10-01" },
  { id: "RDS", name: "Rise of Destiny", released: "2004-11-20" },
  { id: "FET", name: "Flaming Eternity", released: "2005-03-01" },
  { id: "TLM", name: "The Lost Millennium", released: "2005-06-01" },
  { id: "CRV", name: "Cybernetic Revolution", released: "2005-08-17" },
  { id: "EEN", name: "Elemental Energy", released: "2005-11-16" },
  { id: "DP1", name: "Duelist Pack: Jaden Yuki", released: "2006-02-08", pack: "duelist" },
  { id: "DP2", name: "Duelist Pack: Chazz Princeton", released: "2006-02-08", pack: "duelist" },
  { id: "SOI", name: "Shadow of Infinity", released: "2006-02-18" },
  { id: "EOJ", name: "Enemy of Justice", released: "2006-05-17" },
  { id: "POTD", name: "Power of the Duelist", released: "2006-08-16" },
  { id: "CDIP", name: "Cyberdark Impact", released: "2006-11-15" },
  { id: "DP03", name: "Duelist Pack: Jaden Yuki 2", released: "2007-02-07", pack: "duelist" },
  { id: "DP05", name: "Duelist Pack: Aster Phoenix", released: "2007-02-07", pack: "duelist" },
  { id: "STON", name: "Strike of Neos", released: "2007-02-28" },
  { id: "DP04", name: "Duelist Pack: Zane Truesdale", released: "2007-03-07", pack: "duelist" },
  { id: "FOTB", name: "Force of the Breaker", released: "2007-05-16" },
  { id: "TAEV", name: "Tactical Evolution", released: "2007-08-15" },
  { id: "GLAS", name: "Gladiator's Assault", released: "2007-11-14" },
  { id: "DP06", name: "Duelist Pack: Jaden Yuki 3", released: "2008-01-26", pack: "duelist" },
  { id: "DP07", name: "Duelist Pack: Jesse Anderson", released: "2008-01-26", pack: "duelist" },
  { id: "PTDN", name: "Phantom Darkness", released: "2008-02-13" },
  { id: "LODT", name: "Light of Destruction", released: "2008-05-13" },
  { id: "RP01", name: "Retro Pack", released: "2008-07-08" },
  { id: "TDGS", name: "The Duelist Genesis", released: "2008-09-02" },
  { id: "CSOC", name: "Crossroads of Chaos", released: "2008-11-18" },
  { id: "DP08", name: "Duelist Pack: Yusei", released: "2009-02-24", pack: "duelist" },
  { id: "CRMS", name: "Crimson Crisis", released: "2009-03-03" },
  { id: "RGBT", name: "Raging Battle", released: "2009-05-12" },
  { id: "DPYG", name: "Duelist Pack: Yugi", released: "2009-07-07", pack: "duelist" },
  { id: "RP02", name: "Retro Pack 2", released: "2009-07-28" },
  { id: "ANPR", name: "Ancient Prophecy", released: "2009-09-01" },
  { id: "HA01", name: "Hidden Arsenal", released: "2009-11-05", pack: "mini" },
  { id: "SOVR", name: "Stardust Overdrive", released: "2009-11-17" },
  { id: "DP09", name: "Duelist Pack: Yusei 2", released: "2010-01-15", pack: "duelist" },
  { id: "DT01", name: "Duel Terminal 1", released: "2010-01-29", pack: "terminal" },
  { id: "ABPF", name: "Absolute Powerforce", released: "2010-02-12" },
  { id: "DPKB", name: "Duelist Pack: Kaiba", released: "2010-04-16", pack: "duelist" },
  { id: "TSHD", name: "The Shining Darkness", released: "2010-05-07" },
  { id: "DT02", name: "Duel Terminal 2", released: "2010-05-25", pack: "terminal" },
  { id: "HA02", name: "Hidden Arsenal 2", released: "2010-07-15", pack: "mini" },
  { id: "DREV", name: "Duelist Revolution", released: "2010-08-17" },
  { id: "DT03", name: "Duel Terminal 3", released: "2010-09-25", pack: "terminal" },
  { id: "STBL", name: "Starstrike Blast", released: "2010-11-11" },
  { id: "HA03", name: "Hidden Arsenal 3", released: "2010-12-02", pack: "mini" },
  { id: "DP10", name: "Duelist Pack: Yusei 3", released: "2011-01-21", pack: "duelist" },
  { id: "DT04", name: "Duel Terminal 4", released: "2011-01-25", pack: "terminal" },
  { id: "STOR", name: "Storm of Ragnarok", released: "2011-02-08" },
  { id: "HA04", name: "Hidden Arsenal 4: Trishula's Triumph", released: "2011-04-15", pack: "mini" },
  { id: "EXVC", name: "Extreme Victory", released: "2011-05-06" },
  { id: "DP11", name: "Duelist Pack: Crow", released: "2011-05-27", pack: "duelist" },
  { id: "DT05", name: "Duel Terminal 5", sources: ["Duel Terminal 5a","Duel Terminal 5b"], released: "2011-05-29", pack: "terminal" },
  { id: "GENF", name: "Generation Force", released: "2011-08-16" },
  { id: "PHSW", name: "Photon Shockwave", released: "2011-11-10" },
  { id: "HA05", name: "Hidden Arsenal 5: Steelswarm Invasion", released: "2011-12-01", pack: "mini" },
  { id: "ORCS", name: "Order of Chaos", released: "2012-01-20" },
  { id: "DT06", name: "Duel Terminal 6", sources: ["Duel Terminal 6a","Duel Terminal 6b"], released: "2012-02-03", pack: "terminal" },
  { id: "RYMP", name: "Ra Yellow Mega Pack", released: "2012-02-17", pack: "mega" },
  { id: "GAOV", name: "Galactic Overlord", released: "2012-05-08" },
  { id: "BP01", name: "Battle Pack: Epic Dawn", released: "2012-05-24", pack: "battlePack" },
  { id: "HA06", name: "Hidden Arsenal 6: Omega Xyz", released: "2012-07-24", pack: "mini" },
  { id: "REDU", name: "Return of the Duelist", released: "2012-08-24" },
  { id: "DT07", name: "Duel Terminal 7", sources: ["Duel Terminal 7a","Duel Terminal 7b"], released: "2012-09-28", pack: "terminal" },
  { id: "ABYR", name: "Abyss Rising", released: "2012-11-09" },
  { id: "CBLZ", name: "Cosmo Blazer", released: "2013-01-25" },
  { id: "SP13", name: "Star Pack 2013", released: "2013-03-01", pack: "star" },
  { id: "HA07", name: "Hidden Arsenal 7: Knight of Stars", released: "2013-04-26", pack: "mini" },
  { id: "LTGY", name: "Lord of the Tachyon Galaxy", released: "2013-05-17" },
  { id: "BP02", name: "Battle Pack 2: War of the Giants", released: "2013-06-28", pack: "battlePack" },
  { id: "NUMH", name: "Number Hunters", released: "2013-07-12", pack: "mini" },
  { id: "JOTL", name: "Judgment of the Light", released: "2013-08-08" },
  { id: "SHSP", name: "Shadow Specters", released: "2013-11-08" },
  { id: "BPW2", name: "War of the Giants: Round 2", released: "2014-01-17", pack: "duelist" },
  { id: "LVAL", name: "Legacy of the Valiant", released: "2014-01-24" },
  { id: "SP14", name: "Star Pack 2014", released: "2014-02-21", pack: "star" },
  { id: "DRLG", name: "Dragons of Legend", released: "2014-04-25", pack: "mini" },
  { id: "PRIO", name: "Primal Origin", released: "2014-05-16" },
  { id: "BP03", name: "Battle Pack 3: Monster League", released: "2014-07-31", pack: "battlePack" },
  { id: "DUEA", name: "Duelist Alliance", released: "2014-08-14" },
  { id: "NECH", name: "The New Challengers", released: "2014-11-06" },
  { id: "SECE", name: "Secrets of Eternity", released: "2015-01-15" },
  { id: "THSF", name: "The Secret Forces", released: "2015-02-12", pack: "mini" },
  { id: "WSUP", name: "World Superstars", released: "2015-04-16", pack: "mini" },
  { id: "CROS", name: "Crossed Souls", released: "2015-05-14" },
  { id: "SP15", name: "Star Pack ARC-V", released: "2015-06-12", pack: "star" },
  { id: "DPBC", name: "Duelist Pack: Battle City", released: "2015-06-19", pack: "duelist" },
  { id: "DRL2", name: "Dragons of Legend 2", released: "2015-07-16", pack: "mini" },
  { id: "CORE", name: "Clash of Rebellions", released: "2015-08-06" },
  { id: "HSRD", name: "High-Speed Riders", released: "2015-10-01", pack: "riders" },
  { id: "DOCS", name: "Dimension of Chaos", released: "2015-11-05" },
  { id: "BOSH", name: "Breakers of Shadow", released: "2016-01-14" },
  { id: "WIRA", name: "Wing Raiders", released: "2016-02-11", pack: "riders" },
  { id: "MIL1", name: "Millennium Pack", released: "2016-04-14", pack: "duelist" },
  { id: "SHVI", name: "Shining Victories", released: "2016-05-05" },
  { id: "MVP1", name: "Yu-Gi-Oh! The Dark Side of Dimensions Movie Pack", released: "2016-07-21", pack: "battles" },
  { id: "TDIL", name: "The Dark Illusion", released: "2016-08-04" },
  { id: "DRL3", name: "Dragons of Legend: Unleashed", released: "2016-08-18", pack: "mini" },
  { id: "DPRP", name: "Duelist Pack: Rivals of the Pharaoh", released: "2016-09-15", pack: "duelist" },
  { id: "INOV", name: "Invasion: Vengeance", released: "2016-11-03" },
  { id: "DESO", name: "Destiny Soldiers", released: "2016-11-17", pack: "mini" },
  { id: "RATE", name: "Raging Tempest", released: "2017-02-09" },
  { id: "FUEN", name: "Fusion Enforcers", released: "2017-02-23", pack: "mini" },
  { id: "SP17", name: "Star Pack Battle Royal", released: "2017-03-09", pack: "star" },
  { id: "MACR", name: "Maximum Crisis", released: "2017-05-04" },
  { id: "DPDG", name: "Duelist Pack: Dimensional Guardians", released: "2017-05-25", pack: "duelist" },
  { id: "PEVO", name: "Pendulum Evolution", released: "2017-06-22", pack: "mini" },
  { id: "BLLR", name: "Battles of Legend: Light's Revenge", released: "2017-07-06", pack: "battles" },
  { id: "COTD", name: "Code of the Duelist", released: "2017-08-03" },
  { id: "LEDU", name: "Legendary Duelists", released: "2017-09-07", pack: "legendary" },
  { id: "CIBR", name: "Circuit Break", released: "2017-10-19" },
  { id: "SPWA", name: "Spirit Warriors", released: "2017-11-16", pack: "mini" },
  { id: "EXFO", name: "Extreme Force", released: "2018-02-01" },
  { id: "LED2", name: "Legendary Duelists: Ancient Millennium", released: "2018-02-22", pack: "legendary" },
  { id: "SP18", name: "Star Pack VRAINS", released: "2018-03-29", pack: "star" },
  { id: "FLOD", name: "Flames of Destruction", released: "2018-05-03" },
  { id: "DASA", name: "Dark Saviors", released: "2018-05-24", pack: "mini" },
  { id: "BLRR", name: "Battles of Legend: Relentless Revenge", released: "2018-06-28", pack: "battles" },
  { id: "CYHO", name: "Cybernetic Horizon", released: "2018-07-26" },
  { id: "SHVA", name: "Shadows in Valhalla", released: "2018-08-16", pack: "mini" },
  { id: "LED3", name: "Legendary Duelists: White Dragon Abyss", released: "2018-09-27", pack: "legendary" },
  { id: "SOFU", name: "Soul Fusion", released: "2018-10-18" },
  { id: "HISU", name: "Hidden Summoners", released: "2018-11-15", pack: "mini" },
  { id: "LED4", name: "Legendary Duelists: Sisters of the Rose", released: "2019-01-10", pack: "legendary" },
  { id: "SAST", name: "Savage Strike", released: "2019-01-31" },
  { id: "INCH", name: "The Infinity Chasers", released: "2019-03-21", pack: "mini" },
  { id: "DANE", name: "Dark Neostorm", released: "2019-05-02" },
  { id: "BLHR", name: "Battles of Legend: Hero's Revenge", released: "2019-07-11", pack: "battles" },
  { id: "RIRA", name: "Rising Rampage", released: "2019-07-26" },
  { id: "FIGA", name: "Fists of the Gadgets", released: "2019-08-22", pack: "mini" },
  { id: "LED5", name: "Legendary Duelists: Immortal Destiny", released: "2019-09-26", pack: "legendary" },
  { id: "CHIM", name: "Chaos Impact", released: "2019-10-24" },
  { id: "MYFI", name: "Mystic Fighters", released: "2019-11-22", pack: "mini" },
  { id: "LED6", name: "Legendary Duelists: Magical Hero", released: "2020-01-16", pack: "legendary" },
  { id: "IGAS", name: "Ignition Assault", released: "2020-01-30" },
  { id: "SESL", name: "Secret Slayers", released: "2020-04-03", pack: "mini" },
  { id: "ETCO", name: "Eternity Code", released: "2020-04-30" },
  { id: "TOCH", name: "Toon Chaos", released: "2020-06-18", pack: "rares" },
  { id: "BLAR", name: "Battles of Legend: Armageddon", released: "2020-07-23", pack: "battles" },
  { id: "ROTD", name: "Rise of the Duelist", released: "2020-08-06" },
  { id: "LED7", name: "Legendary Duelists: Rage of Ra", released: "2020-09-24", pack: "legendary" },
  { id: "PHRA", name: "Phantom Rage", released: "2020-11-05" },
  { id: "GEIM", name: "Genesis Impact", released: "2020-12-03", pack: "rares" },
  { id: "BLVO", name: "Blazing Vortex", released: "2021-02-04" },
  { id: "ANGU", name: "Ancient Guardians", released: "2021-04-29", pack: "rares" },
  { id: "LIOV", name: "Lightning Overdrive", released: "2021-06-03" },
  { id: "KICO", name: "King's Court", released: "2021-07-08", pack: "rares" },
  { id: "DAMA", name: "Dawn of Majesty", released: "2021-08-12" },
  { id: "LED8", name: "Legendary Duelists: Synchro Storm", released: "2021-10-28", pack: "legendary" },
  { id: "BODE", name: "Burst of Destiny", released: "2021-11-04" },
  { id: "GRCR", name: "The Grand Creators", released: "2022-01-27", pack: "rares" },
  { id: "BACH", name: "Battle of Chaos", released: "2022-02-10" },
  { id: "HAC1", name: "Hidden Arsenal: Chapter 1", released: "2022-02-24", pack: "arsenal" },
  { id: "DIFO", name: "Dimension Force", released: "2022-05-19" },
  { id: "LED9", name: "Legendary Duelists: Duels From the Deep", released: "2022-06-16", pack: "legendary" },
  { id: "POTE", name: "Power of the Elements", released: "2022-08-04" },
  { id: "TAMA", name: "Tactical Masters", released: "2022-08-25", pack: "rares" },
  { id: "DABL", name: "Darkwing Blast", released: "2022-10-20" },
  { id: "BLCR", name: "Battles of Legend: Crystal Revenge", released: "2022-11-17", pack: "battles" },
  { id: "AMDE", name: "Amazing Defenders", released: "2023-01-19", pack: "rares" },
  { id: "PHHY", name: "Photon Hypernova", released: "2023-02-09" },
  { id: "MAZE", name: "Maze of Memories", released: "2023-03-09", pack: "rares" },
  { id: "CYAC", name: "Cyberstorm Access", released: "2023-05-04" },
  { id: "WISU", name: "Wild Survivors", released: "2023-06-01", pack: "rares" },
  { id: "BLMR", name: "Battles of Legend: Monstrous Revenge", released: "2023-06-22", pack: "battles" },
  { id: "DUNE", name: "Duelist Nexus", released: "2023-07-27" },
  { id: "LD10", name: "Legendary Duelists: Soulburning Volcano", released: "2023-08-10", pack: "legendary" },
  { id: "AGOV", name: "Age of Overlord", released: "2023-10-19" },
  { id: "RA01", name: "25th Anniversary Rarity Collection", released: "2023-11-02", pack: "rarity" },
  { id: "VASM", name: "Valiant Smashers", released: "2023-11-16", pack: "rares" },
  { id: "MZMI", name: "Maze of Millennia", released: "2024-01-18", pack: "rares" },
  { id: "PHNI", name: "Phantom Nightmare", released: "2024-02-08" },
  { id: "LEDE", name: "Legacy of Destruction", released: "2024-04-25" },
  { id: "RA02", name: "25th Anniversary Rarity Collection II", released: "2024-05-23", pack: "rarity" },
  { id: "BLTR", name: "Battles of Legend: Terminal Revenge", released: "2024-06-20", pack: "battles" },
  { id: "INFO", name: "The Infinite Forbidden", released: "2024-07-18" },
  { id: "ROTA", name: "Rage of the Abyss", released: "2024-10-10" },
  { id: "RA03", name: "Quarter Century Bonanza", released: "2024-11-07", pack: "rarity" },
  { id: "CRBR", name: "Crossover Breakers", released: "2024-12-05", pack: "rares" },
  { id: "SUDA", name: "Supreme Darkness", released: "2025-01-23" },
  { id: "MZTM", name: "Maze of the Master", released: "2025-03-13", pack: "rares" },
  { id: "RA04", name: "Quarter Century Stampede", released: "2025-04-10", pack: "rarity" },
  { id: "ALIN", name: "Alliance Insight", released: "2025-05-01" },
  { id: "JUSH", name: "Justice Hunters", released: "2025-07-31", pack: "rares" },
  { id: "BLMM", name: "Battles of Legend: Monster Mayhem", released: "2025-08-28", pack: "battles" },
  { id: "DOOD", name: "Doom of Dimensions", released: "2025-09-25" },
  { id: "PHRE", name: "Phantom Revenge", released: "2025-12-04", pack: "rares" },
  { id: "BPRO", name: "Burst Protocol", released: "2026-02-05" },
  { id: "MZMU", name: "Maze of Muertos", released: "2026-02-19", pack: "rares" },
  { id: "RA05", name: "Rarity Collection 5", released: "2026-04-09", pack: "rarity" },
  { id: "BLZD", name: "Blazing Dominion", released: "2026-05-07" },
  { id: "BLGG", name: "Battles of Legend: Glorious Gallery", released: "2026-06-04", pack: "battles" },
  { id: "CORI", name: "Chaos Origins", released: "2026-07-02" },];

const byId = new Map(YGO_SETS.map((s) => [s.id, s]));
export const ygoSet = (id: string): YgoSet | undefined => byId.get(id);

/** The names YGOPRODeck lists a set's cards under. */
export const sourcesOf = (set: YgoSet) => set.sources ?? [set.name];

/** Changes whenever sets are added or removed, so caches of the set list know to refresh. */
export const YGO_SETS_SIGNATURE = `${YGO_SETS.length}-${YGO_SETS[YGO_SETS.length - 1].id}`;

/* ---------- Packs ---------- */

/** A printing's finish comes with its rarity (cards.ts), so a slot may give either and the card decides. */
const EITHER = { normal: 1, holo: 1 };

const slot = (label: string, count: number, table: Record<string, number>, fallback?: Record<string, number>): SlotProfile => ({ label, count, table, fallback, finish: EITHER });

/** Short Prints are commons printed less often, and Super Short Prints rarer still. */
const COMMONS = { Common: 89, "Short Print": 10, "Super Short Print": 1 };

/** The collector rarities that turn up about once a box, or less, in a core booster's foil slot. */
const CHASE = { "Ultimate Rare": 1, "Ghost Rare": 0.1, "Starlight Rare": 0.5, "Quarter Century Secret Rare": 1 };

/** Core boosters: three eras of 9-card packs. */
export type CoreEra = "classic" | "foil" | "modern";

/** Duelist Alliance put a foil in every pack; Eternity Code dropped Rares for a Super Rare in every pack. */
export function coreEra(set: Pick<YgoSet, "released">): CoreEra {
  if (set.released >= "2020-04-30") return "modern";
  if (set.released >= "2014-08-14") return "foil";
  return "classic";
}

export const CORE_PROFILES: Record<CoreEra, PackProfile> = {
  // 8 commons, then a Rare or better: Super 1 in 6, Ultra 1 in 12, Ultimate 1 in 24, Secret 1 in 31, Ghost 1 in 288.
  classic: {
    id: "ygo-classic",
    name: "Yu-Gi-Oh! booster, 2002–2014",
    series: ["ygo"],
    variantsKnown: true,
    slots: [slot("Common", 8, COMMONS), slot("Rare", 1, { Rare: 0.64, "Super Rare": 0.167, "Ultra Rare": 0.083, "Ultimate Rare": 0.042, "Secret Rare": 0.032, "Ghost Rare": 0.0035 })],
  },
  // 7 commons, a Rare, and a foil: per box, 18 Super, 4 Ultra and 2 Secret Rares, and the odd collector rarity.
  foil: {
    id: "ygo-foil",
    name: "Yu-Gi-Oh! booster, 2014–2020",
    series: ["ygo"],
    variantsKnown: true,
    slots: [slot("Common", 7, COMMONS), slot("Rare", 1, { Rare: 1 }), slot("Foil", 1, { "Super Rare": 18, "Ultra Rare": 4, "Secret Rare": 2, ...CHASE })],
  },
  // 7 commons, a Super Rare, and a foil that's sometimes much more.
  modern: {
    id: "ygo-modern",
    name: "Yu-Gi-Oh! booster, 2020 on",
    series: ["ygo"],
    variantsKnown: true,
    slots: [slot("Common", 7, COMMONS), slot("Super Rare", 1, { "Super Rare": 1 }), slot("Foil", 1, { "Super Rare": 14.5, "Ultra Rare": 6, "Secret Rare": 2, ...CHASE })],
  },
};

export type OtherPack = "mini" | "battles" | "riders" | "duelist" | "legendary" | "rares" | "rarity" | "terminal" | "arsenal" | "star" | "battlePack" | "mega";

/**
 * Packs unlike the core boosters:
 * - mini: the 60-card sets between core sets (The Secret Forces on), Hidden Arsenal and Dragons of Legend. 5 cards,
 *   all foil: 4 Super Rares and a Secret Rare (Ultra Rares where a set has no Supers or no Secrets).
 * - battles: Battles of Legend and the Movie Pack. 5 cards: 4 Ultra Rares and a Secret Rare, sometimes more.
 * - riders: High-Speed Riders and Wing Raiders. 5 cards: 3 commons, a Rare and a foil.
 * - duelist: Duelist Packs, Millennium Pack and War of the Giants: Round 2. 5 cards: 4 commons and a Rare or better.
 * - legendary: Legendary Duelists. 5 cards: 3 commons, a Rare or Super Rare, and an Ultra Rare.
 * - rares: the Collector's Rare sets (Toon Chaos on), the Maze sets and King's Court. 5 cards: 3 Rares, a Super
 *   Rare, and an Ultra Rare or better.
 * - rarity: the Rarity Collections, every card in several rarities. 8 cards: 4 Super, 2 Ultra, a Secret, and one
 *   of the collector rarities.
 * - terminal: Duel Terminal. 5 cards, all parallel foils: 3 normal, a rare, and a Super or Ultra.
 * - arsenal: Hidden Arsenal: Chapter 1. 7 cards: 5 commons, a normal parallel, and an Ultra parallel or a Secret.
 * - star: Star Packs. 3 cards, commons, each sometimes a Starfoil (or Shatterfoil).
 * - battlePack: Battle Packs. 5 cards: 3 commons, a Rare, and a Starfoil, Mosaic or Shatterfoil.
 * - mega: Ra Yellow Mega Pack, a 9-card pack like the core boosters of its day.
 */
export const OTHER_PROFILES: Record<OtherPack, PackProfile> = {
  mini: {
    id: "ygo-mini",
    name: "Yu-Gi-Oh! 5-card foil pack",
    series: ["ygo"],
    variantsKnown: true,
    slots: [slot("Super Rare", 4, { "Super Rare": 1 }, { "Ultra Rare": 1 }), slot("Secret Rare", 1, { "Secret Rare": 1, "Prismatic Secret Rare": 1 }, { "Ultra Rare": 1 })],
  },
  battles: {
    id: "ygo-battles",
    name: "Battles of Legend pack",
    series: ["ygo"],
    variantsKnown: true,
    slots: [slot("Ultra Rare", 4, { "Ultra Rare": 1 }), slot("Secret Rare", 1, { "Secret Rare": 10, "Quarter Century Secret Rare": 1, "Starlight Rare": 1 }, { "Ultra Rare": 1 })],
  },
  riders: {
    id: "ygo-riders",
    name: "Yu-Gi-Oh! 5-card pack",
    series: ["ygo"],
    variantsKnown: true,
    slots: [slot("Common", 3, { Common: 1 }), slot("Rare", 1, { Rare: 1 }), slot("Foil", 1, { "Super Rare": 10, "Ultra Rare": 5, "Secret Rare": 3 })],
  },
  duelist: {
    id: "ygo-duelist",
    name: "Duelist Pack",
    series: ["ygo"],
    variantsKnown: true,
    slots: [slot("Common", 4, { Common: 1 }), slot("Rare", 1, { Rare: 12, "Super Rare": 4, "Ultra Rare": 2, "Ultimate Rare": 1, "Ghost Rare": 0.05 })],
  },
  legendary: {
    id: "ygo-legendary",
    name: "Legendary Duelists pack",
    series: ["ygo"],
    variantsKnown: true,
    slots: [slot("Common", 3, { Common: 1 }), slot("Rare", 1, { Rare: 3, "Super Rare": 2 }), slot("Ultra Rare", 1, { "Ultra Rare": 1, "Ghost Rare": 0.02 })],
  },
  rares: {
    id: "ygo-rares",
    name: "Yu-Gi-Oh! all-rare pack",
    series: ["ygo"],
    variantsKnown: true,
    slots: [
      slot("Rare", 3, { Rare: 1 }),
      slot("Super Rare", 1, { "Super Rare": 1 }),
      slot("Foil", 1, { "Ultra Rare": 6, "Collector's Rare": 2, "Secret Rare": 2, "Ultra Rare (Pharaoh's Rare)": 0.5, "Quarter Century Secret Rare": 0.5, "Starlight Rare": 0.5 }),
    ],
  },
  rarity: {
    id: "ygo-rarity",
    name: "Rarity Collection pack",
    series: ["ygo"],
    variantsKnown: true,
    slots: [
      slot("Super Rare", 4, { "Super Rare": 1 }),
      slot("Ultra Rare", 2, { "Ultra Rare": 1 }),
      slot("Secret Rare", 1, { "Secret Rare": 1 }),
      slot("Collector", 1, { "Ultimate Rare": 3, "Collector's Rare": 3, "Platinum Secret Rare": 1.5, "Quarter Century Secret Rare": 1.5, "Starlight Rare": 1.5 }),
    ],
  },
  terminal: {
    id: "ygo-terminal",
    name: "Duel Terminal pack",
    series: ["ygo"],
    variantsKnown: true,
    slots: [
      slot("Parallel", 3, { "Duel Terminal Normal Parallel Rare": 1 }),
      slot("Rare Parallel", 1, { "Duel Terminal Rare Parallel Rare": 1, "Duel Terminal Normal Rare Parallel Rare": 0.05 }),
      slot("Foil", 1, { "Duel Terminal Super Parallel Rare": 2, "Duel Terminal Ultra Parallel Rare": 1 }),
    ],
  },
  arsenal: {
    id: "ygo-arsenal",
    name: "Hidden Arsenal: Chapter 1 pack",
    series: ["ygo"],
    variantsKnown: true,
    slots: [slot("Common", 5, { Common: 1 }), slot("Parallel", 1, { "Duel Terminal Normal Parallel Rare": 1 }), slot("Foil", 1, { "Duel Terminal Ultra Parallel Rare": 4, "Secret Rare": 1 })],
  },
  star: {
    id: "ygo-star",
    name: "Star Pack",
    series: ["ygo"],
    variantsKnown: true,
    slots: [slot("Card", 3, { Common: 3, "Starfoil Rare": 1, Starfoil: 1, "Shatterfoil Rare": 1 })],
  },
  battlePack: {
    id: "ygo-battle-pack",
    name: "Battle Pack",
    series: ["ygo"],
    variantsKnown: true,
    slots: [slot("Common", 3, { Common: 1 }), slot("Rare", 1, { Rare: 1 }), slot("Foil", 1, { "Starfoil Rare": 1, "Mosaic Rare": 1, "Shatterfoil Rare": 1 })],
  },
  mega: {
    id: "ygo-mega",
    name: "Mega Pack",
    series: ["ygo"],
    variantsKnown: true,
    slots: [slot("Common", 7, { Common: 1 }), slot("Rare", 1, { Rare: 1 }), slot("Foil", 1, { "Super Rare": 14, "Ultra Rare": 6, "Secret Rare": 4 })],
  },
};

export const ygoProfile = (set: YgoSet): PackProfile => (set.pack ? OTHER_PROFILES[set.pack] : CORE_PROFILES[coreEra(set)]);

/* ---------- Drawing sets ---------- */

/** The sets packs are drawn from, limited to `eras` (empty or unknown means every era). */
export function ygoDrawableSets(eras: string[] = []): YgoSet[] {
  const known = eras.filter((e) => YGO_ERAS.some((x) => x.id === e));
  return known.length ? YGO_SETS.filter((s) => known.includes(ygoEra(s))) : YGO_SETS;
}

/** How scarce a set's packs are (setRarity.json, from scripts/ygoSetRarity.ts); sets missing from it are "common". */
export function ygoSetTier(id: string): SetTier {
  return (rarity as { sets: Record<string, { tier: SetTier }> }).sets[id]?.tier ?? "common";
}
