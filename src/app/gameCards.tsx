// Where this game's cards come from, and the few ways its pages describe them differently. Pokémon's come from TCGdex
// (the app's cached client), Magic's from Scryfall by way of the Worker (src/mtg/client.ts). Pages use this instead of
// either one, so the same page shows every game's cards.

import type { ReactNode } from "react";
import type { CardPricing, Progress } from "../api/tcgdex";
import type { SetData, SetDetail, SetSummary } from "../api/types";
import { FINISH_ORDER } from "../collection/cardGroups";
import { FINISH_LABEL, type FinishKey } from "../collection/pokedex";
import { hiddenReason } from "../engine/openable";
import { profileFor } from "../engine/profiles";
import { drawableSets, ERAS } from "../engine/randomSet";
import { setTier, type SetTier } from "../engine/setRarity";
import type { PackProfile } from "../engine/types";
import { setSymbol } from "../mtg/cards";
import { mtgPackArts, mtgPackArtSets } from "../mtg/packArt";
import { packArt, packArts, type PackArt } from "../packs/art";
import packPhotos from "../packs/packArt.json";
import { cachedMtgCardPricing, forgetMtgSet, getMtgCardPricing, getMtgSet, getMtgSets } from "../mtg/client";
import { boosterEra, MTG_ERAS, mtgDrawableSets, mtgProfile, mtgSet, mtgSetTier } from "../mtg/sets";
import { client } from "./client";
import type { Game } from "../game";
import { GAME } from "./game";
import { SetLogo } from "./SetLogo";
import "../mtg/mtg.css";

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
  packCredit: { text: "Pack photos from", name: "Bulbapedia", url: "https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_Trading_Card_Game#International_sets" },
};

// A Magic card is just foil or not.
const MTG_FINISHES = { firstEdition: "1st Edition", holo: "Foil", reverse: "Reverse holo", normal: "Non-foil" };

const mtg: GameCards = {
  listSetSummaries: getMtgSets,
  getSetCards: (id) => getMtgSet(id),
  forgetSetCards: forgetMtgSet,
  getCardPricing: getMtgCardPricing,
  cachedCardPricing: cachedMtgCardPricing,
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
  packCredit: { text: "Wrappers drawn around card art (by its artists) from", name: "Scryfall", url: "https://scryfall.com" },
};

/** A game's cards: for a card from another game than this one, like a friend's post in the shared feed. */
export const cardsFor = (game: Game): GameCards => (game === "mtg" ? mtg : pokemon);

/** This game's cards. */
export const gameCards: GameCards = cardsFor(GAME);
