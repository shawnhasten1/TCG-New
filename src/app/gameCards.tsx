// Where this game's cards come from, and the few ways its pages describe them differently. Pokémon's come from TCGdex
// (the app's cached client), Magic's from Scryfall and Yu-Gi-Oh!'s from YGOPRODeck, both by way of the Worker
// (app/workerCards.ts). Pages use this instead of any one of them, so the same page shows every game's cards.

import type { ReactNode } from "react";
import type { CardPricing, Progress } from "../api/tcgdex";
import type { Card, CardWithSet, SetData, SetDetail, SetSummary } from "../api/types";
import { layoutFor, type FrameLayout } from "../foil/layouts";
import { FINISH_ORDER } from "../collection/cardGroups";
import { FINISH_LABEL, speciesOf, type FinishKey } from "../collection/pokedex";
import { hiddenReason } from "../engine/openable";
import { profileFor } from "../engine/profiles";
import { drawableSets, ERAS } from "../engine/randomSet";
import { setTier, type SetTier } from "../engine/setRarity";
import type { PackProfile } from "../engine/types";
import { rarityRank as mtgRarityRank, setSymbol } from "../mtg/cards";
import { mtgPackArts, mtgPackArtSets } from "../mtg/packArt";
import { packArt, packArts, type PackArt } from "../packs/art";
import packPhotos from "../packs/packArt.json";
import { mtgCards } from "../mtg/client";
import { boosterEra, foilEra, MTG_ERAS, mtgDrawableSets, mtgProfile, mtgSet, mtgSetTier } from "../mtg/sets";
import { client } from "./client";
import type { Game } from "../game";
import { GAME } from "./game";
import { SetLogo } from "./SetLogo";
import { rarityRank as ygoRarityRank } from "../ygo/cards";
import { ygoCards } from "../ygo/client";
import { ygoPackArts, ygoPackArtSets } from "../ygo/packArt";
import { ygoDrawableSets, YGO_ERAS, ygoEra, ygoProfile, ygoSet, ygoSetTier } from "../ygo/sets";
import "../mtg/mtg.css";
import "../ygo/ygo.css";

/** Enough of a set to show its logo or symbol. */
type SetMarkSet = { id: string; name: string; logo?: string | null };

export interface GameCards {
  /** Every set, for the set browser and to name and count the sets in a collection. */
  listSetSummaries(): Promise<SetSummary[]>;
  getSetCards(id: string, onProgress?: Progress): Promise<SetData>;
  /** Drops a set's cached cards, so the next getSetCards fetches them fresh. */
  forgetSetCards(id: string): Promise<void>;
  /** Today's prices for one card, or null if it has none. */
  getCardPricing(id: string): Promise<CardPricing | null>;
  /** Today's prices already on the device for any of `ids`, without fetching the rest. */
  cachedCardPricing(ids: string[]): Promise<Map<string, CardPricing | null>>;
  /** How the set's packs are made up, which says which of its cards packs can hold. */
  profileFor(set: SetDetail): PackProfile | undefined;
  /** Why the set browser leaves a set out (packs never come from it), or undefined. */
  hiddenReason(set: SetSummary): string | undefined;
  /** The eras packs can be limited to, in Settings. */
  eras: readonly { id: string; name: string }[];
  /** The sets packs are drawn from, limited to `eras` (empty means every era). The server draws from the same ones. */
  drawableSets(sets: SetSummary[], opts: { unopenable?: Record<string, string>; eras?: string[] }): SetSummary[];
  /** How scarce a set's packs are, which weights the draw and sets pity. */
  setTier(id: string): SetTier;
  /** The line under a set's name. */
  describeSet(set: SetDetail): string;
  /** The set's logo or symbol, or `fallback` when it has none. */
  SetMark(props: { set: SetMarkSet; className?: string; loading?: "lazy"; fallback?: ReactNode }): ReactNode;
  /** The finishes cards come in, rarest first. */
  finishes: FinishKey[];
  /** What each finish is called, and its short name for chips. */
  finishName: Record<FinishKey, string>;
  finishShort: Record<FinishKey, string>;
  /** Whether binder slots name the card's rarity, which Magic cards only show by the set symbol's colour. */
  rarityInBinder: boolean;
  /** The binder's footnote: what's left out of completion, and what ✦ marks. */
  binderNote: string;
  /** The designs a set's packs come in (photos of real packs for Pokémon, drawn wrappers for Magic), and one of them. */
  packArts(setId: string): PackArt[];
  packArt(setId: string, artId: string | null | undefined): PackArt | undefined;
  /** Sets whose packs have designs. */
  packArtSets(): string[];
  /**
   * The collection's index, in games that have one: what entries a card is (a Pokémon's Pokédex numbers, a Magic card's
   * oracle id), for "New entry" on the reveal (collection/entries.ts), and what that's called.
   */
  index?: { keys(card: Card): string[]; badge: string; aria: string };
  /**
   * The card index and every printing of a card, in games that have them (the "printings" feature): a card's key (a
   * Magic card's oracle id, a Yu-Gi-Oh! card's passcode), and what the pages need to show its printings.
   */
  printings?: {
    key(card: Card): string | undefined;
    /** Every printing of the card among the sets here, newest set first. */
    get(key: string): Promise<CardWithSet[]>;
    /** Orders rarities, plainest first: the index shows the rarest printing you own. */
    rarityRank(rarity: string): number;
    /** The era a set is from (one of `eras`), which groups printings. */
    eraOf(setId: string): string | undefined;
    set(setId: string): { name: string; released: string } | undefined;
    /** The frame layout of a set's cards, for the close-up. */
    layout(setId: string): FrameLayout;
  };
  /** Where the pack designs come from, for the Packs view. */
  packCredit: { text: string; name: string; url: string };
  /** Where the card data and images come from, and a set to open the debug page on (it reads TCGdex). */
  credit: { name: string; url: string; debugSet?: string };
}

const pokemon: GameCards = {
  listSetSummaries: () => client.listSetSummaries(),
  getSetCards: (id, onProgress) => client.getSetCards(id, onProgress),
  forgetSetCards: (id) => client.forgetSetCards(id),
  getCardPricing: (id) => client.getCardPricing(id),
  cachedCardPricing: (ids) => client.cachedCardPricing(ids),
  profileFor,
  hiddenReason,
  eras: ERAS,
  drawableSets,
  setTier,
  describeSet: (set) => `${set.serie.name}${set.releaseDate ? ` · ${set.releaseDate.slice(0, 4)}` : ""}`,
  SetMark: ({ set, className, loading, fallback }) => <SetLogo logo={set.logo} className={className} loading={loading} fallback={fallback} alt="" />,
  finishes: FINISH_ORDER,
  finishName: { firstEdition: "1st Edition", holo: "Holo", reverse: "Reverse holo", normal: "Normal" },
  finishShort: FINISH_LABEL,
  rarityInBinder: false,
  binderNote: "Faded cards are still missing. “Not in packs” cards (basic energy, cards without scans) don't count toward completion. ✦ marks secret and subset cards.",
  credit: { name: "TCGdex", url: "https://tcgdex.dev", debugSet: "sv03.5" },
  packArts,
  packArt,
  packArtSets: () => Object.keys(packPhotos),
  index: { keys: (c) => speciesOf(c).map(String), badge: "New entry", aria: "New to your Pokédex." },
  packCredit: { text: "Pack photos from", name: "Bulbapedia", url: "https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_Trading_Card_Game#International_sets" },
};

// A Magic card is just foil or not.
const MTG_FINISHES = { firstEdition: "1st Edition", holo: "Foil", reverse: "Reverse holo", normal: "Non-foil" };

const mtg: GameCards = {
  listSetSummaries: () => mtgCards.getSets(),
  getSetCards: (id) => mtgCards.getSet(id),
  forgetSetCards: (id) => mtgCards.forgetSet(id),
  getCardPricing: (id) => mtgCards.getCardPricing(id),
  cachedCardPricing: (ids) => mtgCards.cachedCardPricing(ids),
  profileFor: (set) => {
    const info = mtgSet(set.id);
    return info && mtgProfile(info);
  },
  // Every Magic set here is a booster set.
  hiddenReason: () => undefined,
  eras: MTG_ERAS,
  drawableSets: (sets, { eras }) => {
    const ids = new Set(mtgDrawableSets(eras).map((s) => s.id));
    return sets.filter((s) => ids.has(s.id));
  },
  setTier: mtgSetTier,
  describeSet: (set) => {
    const info = mtgSet(set.id);
    const era = info && MTG_ERAS.find((e) => e.id === boosterEra(info))?.name;
    return [set.id.toUpperCase(), era, set.releaseDate?.slice(0, 4)].filter(Boolean).join(" · ");
  },
  SetMark: ({ set, className, loading }) => <img className={`set-symbol ${className ?? ""}`} src={setSymbol(set.id)} loading={loading} alt="" />,
  finishes: ["holo", "normal"],
  finishName: MTG_FINISHES,
  finishShort: MTG_FINISHES,
  rarityInBinder: true,
  binderNote: "Faded cards are still missing. “Not in packs” cards don't count toward completion. ✦ marks basic lands and printings numbered after the main set.",
  credit: { name: "Scryfall", url: "https://scryfall.com" },
  packArts: mtgPackArts,
  packArt: (setId, artId) => (artId ? mtgPackArts(setId).find((a) => a.id === artId) : undefined),
  packArtSets: mtgPackArtSets,
  index: { keys: (c) => (c.oracleId ? [c.oracleId] : []), badge: "New card", aria: "A card you've never had, in any printing." },
  printings: {
    key: (c) => c.oracleId ?? undefined,
    get: (key) => mtgCards.getPrintings(key),
    rarityRank: mtgRarityRank,
    eraOf: (setId) => {
      const set = mtgSet(setId);
      return set && boosterEra(set);
    },
    set: mtgSet,
    layout: (setId) => {
      const set = mtgSet(setId);
      return layoutFor(set ? `mtg-${foilEra(set)}` : "mtg-modern");
    },
  },
  packCredit: { text: "Wrappers drawn around card art (by its artists) from", name: "Scryfall", url: "https://scryfall.com" },
};

// A Yu-Gi-Oh! printing is foil or not by its rarity.
const YGO_FINISHES = { firstEdition: "1st Edition", holo: "Foil", reverse: "Reverse holo", normal: "Non-foil" };

const ygo: GameCards = {
  listSetSummaries: () => ygoCards.getSets(),
  getSetCards: (id) => ygoCards.getSet(id),
  forgetSetCards: (id) => ygoCards.forgetSet(id),
  getCardPricing: (id) => ygoCards.getCardPricing(id),
  cachedCardPricing: (ids) => ygoCards.cachedCardPricing(ids),
  profileFor: (set) => {
    const info = ygoSet(set.id);
    return info && ygoProfile(info);
  },
  // Every Yu-Gi-Oh! set here is sold in packs.
  hiddenReason: () => undefined,
  eras: YGO_ERAS,
  drawableSets: (sets, { eras }) => {
    const ids = new Set(ygoDrawableSets(eras).map((s) => s.id));
    return sets.filter((s) => ids.has(s.id));
  },
  setTier: ygoSetTier,
  describeSet: (set) => {
    const info = ygoSet(set.id);
    const era = info && YGO_ERAS.find((e) => e.id === ygoEra(info))?.name.replace(/ \(.*\)$/, "");
    return [set.id, era, set.releaseDate?.slice(0, 4)].filter(Boolean).join(" · ");
  },
  // Yu-Gi-Oh! sets have no logos or symbols, so a set shows its booster wrapper.
  SetMark: ({ set, className, loading, fallback }) => {
    const art = ygoPackArts(set.id)[0];
    return art ? <img className={`set-pack ${className ?? ""}`} src={art.src} loading={loading} alt="" /> : fallback;
  },
  finishes: ["holo", "normal"],
  finishName: YGO_FINISHES,
  finishShort: YGO_FINISHES,
  rarityInBinder: true,
  binderNote: "Faded cards are still missing. Completion counts each card once, at its plainest rarity; ✦ marks the same card at a rarer one (a Quarter Century Secret Rare reprint, say).",
  credit: { name: "YGOPRODeck", url: "https://ygoprodeck.com" },
  packArts: ygoPackArts,
  packArt: (setId, artId) => (artId ? ygoPackArts(setId).find((a) => a.id === artId) : undefined),
  packArtSets: ygoPackArtSets,
  index: { keys: (c) => (c.passcode ? [String(c.passcode)] : []), badge: "New card", aria: "A card you've never had, in any printing." },
  printings: {
    key: (c) => (c.passcode ? String(c.passcode) : undefined),
    get: (key) => ygoCards.getPrintings(key),
    rarityRank: ygoRarityRank,
    eraOf: (setId) => {
      const set = ygoSet(setId);
      return set && ygoEra(set);
    },
    set: ygoSet,
    layout: () => layoutFor("ygo"),
  },
  packCredit: { text: "Pack photos from the Yu-Gi-Oh! Wiki, YGOPRODeck and", name: "Yugipedia", url: "https://yugipedia.com" },
};

const GAME_CARDS: Record<Game, GameCards> = { pokemon, mtg, ygo };

/** A game's cards: for a card from another game than this one, like a friend's post in the shared feed. */
export const cardsFor = (game: Game): GameCards => GAME_CARDS[game];

/** This game's cards. */
export const gameCards: GameCards = cardsFor(GAME);
