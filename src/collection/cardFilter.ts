// Search and filters for lists of cards: the binder and the collection views. A search matches card name, set name,
// number (#12), Pokédex number, rarity, type, stage and trainer type; every word has to match somewhere.

import type { Card, CardCategory } from "../api/types";
import { finishCount, sortRarities } from "./cardGroups";
import type { FinishKey } from "./pokedex";
import type { Ownership } from "./progress";

export interface CardFilter {
  query: string;
  category: CardCategory | "all";
  /** A Pokémon type, e.g. "Fire", or "all". */
  type: string;
  rarity: string;
  /** Owned in this finish; cards you don't own never match a finish. */
  finish: FinishKey | "any";
  /** Only cards you've starred (see favorites.ts). */
  favorites: boolean;
}

export const NO_FILTER: CardFilter = { query: "", category: "all", type: "all", rarity: "all", finish: "any", favorites: false };

export const CATEGORY_LABEL: Record<CardCategory, string> = { Pokemon: "Pokémon", Trainer: "Trainer", Energy: "Energy" };

export const isFiltering = (f: CardFilter) => f.query.trim() !== "" || f.category !== "all" || f.type !== "all" || f.rarity !== "all" || f.finish !== "any" || f.favorites;

/** Lower case with accents dropped, so "pokemon" finds "Pokémon". */
export const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export const queryWords = (query: string) => fold(query).split(/\s+/).filter(Boolean);

/** Card numbers compare as numbers when they are ("007" is 7), otherwise as text ("TG05"). */
const sameNumber = (localId: string, n: string) => fold(localId) === n || (/^\d+$/.test(n) && /^\d+$/.test(localId) && Number(localId) === Number(n));

function wordMatches(card: Card, text: string, word: string): boolean {
  if (word.startsWith("#") && word.length > 1) return sameNumber(card.localId, word.slice(1));
  if (/^\d+$/.test(word)) return sameNumber(card.localId, word) || !!card.dexId?.includes(Number(word)) || text.includes(word);
  return text.includes(word);
}

const searchText = (card: Card, setName: string) =>
  fold(
    [card.name, setName, card.rarity, card.category && CATEGORY_LABEL[card.category], card.stage, card.trainerType, card.energyType && `${card.energyType} energy`, ...(card.types ?? [])]
      .filter(Boolean)
      .join(" "),
  );

export function matchesCard(card: Card, filter: CardFilter, opts: { setName?: string; owned?: Ownership; favorites?: ReadonlySet<string> } = {}): boolean {
  if (filter.favorites && !opts.favorites?.has(card.id)) return false;
  if (filter.category !== "all" && card.category !== filter.category) return false;
  if (filter.type !== "all" && !card.types?.includes(filter.type)) return false;
  if (filter.rarity !== "all" && card.rarity !== filter.rarity) return false;
  if (filter.finish !== "any" && !(opts.owned && finishCount(opts.owned, filter.finish) > 0)) return false;
  const words = queryWords(filter.query);
  if (!words.length) return true;
  const text = searchText(card, opts.setName ?? "");
  return words.every((w) => wordMatches(card, text, w));
}

/** The categories, types and rarities present in `cards`, for the filter menus. */
export function filterOptions(cards: Card[]) {
  const categories = (["Pokemon", "Trainer", "Energy"] as CardCategory[]).filter((c) => cards.some((card) => card.category === c));
  const types = [...new Set(cards.flatMap((c) => c.types ?? []))].sort();
  const rarities = sortRarities(cards.map((c) => c.rarity));
  return { categories, types, rarities };
}
