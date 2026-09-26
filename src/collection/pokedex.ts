// Collection by Pokémon: every printing of a Pokémon across sets, with the finishes you own.

import type { Card, CardWithSet, SetSummary } from "../api/types";
import { hiddenReason } from "../engine/openable";
import { packFinishes, packFirstEdition } from "../engine/openPack";
import { profileFor } from "../engine/profiles";
import { ERAS } from "../engine/randomSet";
import { pullTier } from "../engine/tiers";
import type { PackProfile } from "../engine/types";
import names from "./pokedex.json";
import type { Ownership } from "./progress";

const NAMES = names as Record<string, string>;

/** English name for a National Pokédex number, or a fallback for Pokémon newer than the bundled list. */
export function pokemonName(dexId: number, fallback?: string): string {
  return NAMES[dexId] ?? fallback ?? `Pokémon #${dexId}`;
}

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Pokémon whose name (accent-insensitive) or number matches, prefix matches first. */
export function searchPokemon(query: string, limit = 12): { dexId: number; name: string }[] {
  const q = fold(query.trim());
  if (!q) return [];
  const all = Object.entries(NAMES).map(([id, name]) => ({ dexId: Number(id), name, f: fold(name) }));
  const hits = /^\d+$/.test(q) ? all.filter((p) => String(p.dexId) === q) : all.filter((p) => p.f.includes(q));
  hits.sort((a, b) => Number(!a.f.startsWith(q)) - Number(!b.f.startsWith(q)) || a.dexId - b.dexId);
  return hits.slice(0, limit).map(({ dexId, name }) => ({ dexId, name }));
}

/* ---------- Finishes a printing can come in ---------- */

export type FinishKey = "normal" | "holo" | "reverse" | "firstEdition";
export const FINISH_LABEL: Record<FinishKey, string> = { normal: "Normal", holo: "Holo", reverse: "Reverse", firstEdition: "1st Ed" };

/** TCGdex has no holo/reverse flags for these series, so the engine assigns finishes by rarity there. */
const NO_VARIANT_DATA = new Set(["bw", "xy", "sm"]);

/**
 * Finishes this printing can come out of a pack in. Asks the pack engine (packFinishes), so the
 * chips always match what opening packs can give, not just what TCGdex says was printed.
 */
export function obtainableFinishes(card: Card, serieId: string, profile: PackProfile): FinishKey[] {
  // Set-wide in the engine; every BW/XY/SM set on TCGdex lacks the flags, so the serie stands in for it.
  const variantDataMissing = NO_VARIANT_DATA.has(serieId) && !card.variants.holo && !card.variants.reverse;
  const out: FinishKey[] = packFinishes(card, profile, variantDataMissing);
  if (out.length && packFirstEdition(card, profile)) out.push("firstEdition");
  return out;
}

/* ---------- Printings of one Pokémon ---------- */

export interface FinishSlot {
  key: FinishKey;
  owned: number;
  /** Counts toward completion (packs can produce it). */
  obtainable: boolean;
}

export interface Printing {
  card: CardWithSet;
  set?: SetSummary;
  /** Era id (pack profile id), or "other" for sets packs never come from. */
  era: string;
  /** Can come out of a pack in this app. */
  pullable: boolean;
  /** Why not, when it can't. */
  reason?: string;
  owned: number;
  finishes: FinishSlot[];
}

export interface PrintingContext {
  sets: Map<string, SetSummary>;
  unopenable: Record<string, string>;
  owned: Map<string, Ownership>;
}

export function buildPrintings(cards: CardWithSet[], ctx: PrintingContext): Printing[] {
  return cards.map((card) => {
    const set = ctx.sets.get(card.set.id);
    const profile = set && profileFor(set);
    const obtainable = set && profile ? obtainableFinishes(card, set.serie.id, profile) : [];
    const reason = !set
      ? "Unknown set"
      : !profile || hiddenReason(set)
        ? "Promo or special product"
        : ctx.unopenable[set.id]
          ? "Set can't fill a pack"
          : !card.image
            ? "No scan"
            : !obtainable.length
              ? "Rarity not in packs"
              : undefined;
    const o = ctx.owned.get(card.id);
    const count = (k: FinishKey) => (k === "firstEdition" ? o?.firstEdition ?? 0 : o?.byFinish[k] ?? 0);
    // Show every obtainable finish, plus any finish you own that the data didn't predict.
    const keys = (["normal", "holo", "reverse", "firstEdition"] as FinishKey[]).filter((k) => obtainable.includes(k) || count(k) > 0);
    return {
      card,
      set,
      era: (!reason || reason === "No scan" || reason === "Rarity not in packs") && profile ? profile.id : "other",
      pullable: !reason,
      reason,
      owned: o?.total ?? 0,
      finishes: keys.map((key) => ({ key, owned: count(key), obtainable: !reason && obtainable.includes(key) })),
    };
  });
}

export interface PokemonProgress {
  printingsOwned: number;
  printingsTotal: number;
  finishesOwned: number;
  finishesTotal: number;
}

/** Completion over pullable printings only, so 100% is reachable. */
export function pokemonProgress(printings: Printing[]): PokemonProgress {
  const pullable = printings.filter((p) => p.pullable);
  const slots = pullable.flatMap((p) => p.finishes.filter((f) => f.obtainable));
  return {
    printingsOwned: pullable.filter((p) => p.owned > 0).length,
    printingsTotal: pullable.length,
    finishesOwned: slots.filter((f) => f.owned > 0).length,
    finishesTotal: slots.length,
  };
}

export interface EraGroup {
  era: string;
  name: string;
  sets: { set?: SetSummary; setId: string; printings: Printing[] }[];
}

/** Groups printings by era (oldest first), then set by release date, then card number. */
export function groupByEra(printings: Printing[]): EraGroup[] {
  const order = [...ERAS.map((e) => e.id), "other"];
  const eraName = (id: string) => ERAS.find((e) => e.id === id)?.name ?? "Promos & other products";
  const out: EraGroup[] = [];
  for (const era of order) {
    const inEra = printings.filter((p) => p.era === era);
    if (!inEra.length) continue;
    const bySet = new Map<string, Printing[]>();
    for (const p of inEra) (bySet.get(p.card.set.id) ?? bySet.set(p.card.set.id, []).get(p.card.set.id)!).push(p);
    const sets = [...bySet.entries()]
      .map(([setId, ps]) => ({ setId, set: ps[0].set, printings: ps.sort((a, b) => a.card.localId.localeCompare(b.card.localId, undefined, { numeric: true })) }))
      .sort((a, b) => (a.set?.releaseDate ?? "9999").localeCompare(b.set?.releaseDate ?? "9999") || a.setId.localeCompare(b.setId));
    out.push({ era, name: eraName(era), sets });
  }
  return out;
}

/* ---------- The index of Pokémon you own ---------- */

export interface SpeciesEntry {
  dexId: number;
  name: string;
  /** Distinct printings owned. */
  printings: number;
  copies: number;
  /** Your most impressive card of this Pokémon, for the tile art. */
  best: Card;
  lastPulledAt: string;
}

/* ---------- The full Pokédex, by region ---------- */

export interface Region {
  id: string;
  name: string;
  /** First National Pokédex number introduced in this region. */
  first: number;
}

/** Regions in National Pokédex order. Each runs up to the next region's first number; the last is open-ended. */
export const REGIONS: Region[] = [
  { id: "kanto", name: "Kanto", first: 1 },
  { id: "johto", name: "Johto", first: 152 },
  { id: "hoenn", name: "Hoenn", first: 252 },
  { id: "sinnoh", name: "Sinnoh", first: 387 },
  { id: "unova", name: "Unova", first: 494 },
  { id: "kalos", name: "Kalos", first: 650 },
  { id: "alola", name: "Alola", first: 722 },
  { id: "galar", name: "Galar", first: 810 },
  { id: "hisui", name: "Hisui", first: 899 },
  { id: "paldea", name: "Paldea", first: 906 },
];

export function regionOf(dexId: number): Region {
  return REGIONS.findLast((r) => r.first <= dexId) ?? REGIONS[0];
}

export interface DexEntry {
  dexId: number;
  name: string;
  /** Set when you own at least one card of this Pokémon. */
  caught?: SpeciesEntry;
}

export interface RegionDex {
  region: Region;
  entries: DexEntry[];
  caught: number;
}

/** Every Pokémon from #1 up, split by region, with the ones you've caught filled in. */
export function fullDex(species: SpeciesEntry[]): RegionDex[] {
  const caught = new Map(species.map((s) => [s.dexId, s]));
  // Cards can name Pokémon newer than the bundled list; stretch the last region to cover them.
  const last = Math.max(...Object.keys(NAMES).map(Number), ...caught.keys());
  const out = REGIONS.map((region) => ({ region, entries: [] as DexEntry[], caught: 0 }));
  for (let dexId = 1; dexId <= last; dexId++) {
    const s = caught.get(dexId);
    const group = out[REGIONS.indexOf(regionOf(dexId))];
    group.entries.push({ dexId, name: s?.name ?? pokemonName(dexId), caught: s });
    if (s) group.caught++;
  }
  return out;
}

/** The National Pokédex numbers a card counts toward: none for trainers and energy. */
export const speciesOf = (card: Card): number[] => (card.category === "Pokemon" && card.dexId?.length ? card.dexId : []);

/** Ids of the cards that would add a Pokémon to the Pokédex. A tag-team card counts if any Pokémon on it is new. */
export function newEntryIds(cards: Card[], caught: Set<number>): Set<string> {
  return new Set(cards.filter((c) => speciesOf(c).some((d) => !caught.has(d))).map((c) => c.id));
}

/** Owned Pokémon cards grouped by species. Tag-team cards count toward each Pokémon on them. */
export function ownedSpecies(ownedCards: Card[], owned: Map<string, Ownership>): SpeciesEntry[] {
  const by = new Map<number, SpeciesEntry>();
  const score = (c: Card) => pullTier({ card: c, finish: "normal", firstEdition: false, slot: "", outcome: "" });
  for (const card of ownedCards) {
    const o = owned.get(card.id);
    if (!o || card.category !== "Pokemon" || !card.dexId?.length) continue;
    for (const dexId of card.dexId) {
      const e = by.get(dexId);
      if (!e) {
        by.set(dexId, { dexId, name: pokemonName(dexId, card.name), printings: 1, copies: o.total, best: card, lastPulledAt: o.lastPulledAt });
        continue;
      }
      e.printings++;
      e.copies += o.total;
      if (score(card) > score(e.best)) e.best = card;
      if (o.lastPulledAt > e.lastPulledAt) e.lastPulledAt = o.lastPulledAt;
    }
  }
  return [...by.values()];
}
