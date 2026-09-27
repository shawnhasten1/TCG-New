// Where this game's cards come from, and the few ways its pages describe them differently. Pokémon's come from TCGdex
// (the app's cached client), Magic's from Scryfall by way of the Worker (src/mtg/client.ts). Pages use this instead of
// either one, so the same page shows every game's cards.

import type { ReactNode } from "react";
import type { CardPricing, Progress } from "../api/tcgdex";
import type { SetData, SetDetail } from "../api/types";
import { profileFor } from "../engine/profiles";
import type { Finish, PackProfile } from "../engine/types";
import { setSymbol } from "../mtg/cards";
import { cachedMtgCardPricing, forgetMtgSet, getMtgCardPricing, getMtgSet } from "../mtg/client";
import { boosterEra, MTG_ERAS, mtgProfile, mtgSet } from "../mtg/sets";
import { client } from "./client";
import { GAME } from "./game";
import { SetLogo } from "./SetLogo";

export interface GameCards {
  getSetCards(id: string, onProgress?: Progress): Promise<SetData>;
  /** Drops a set's cached cards, so the next getSetCards fetches them fresh. */
  forgetSetCards(id: string): Promise<void>;
  /** Today's prices for one card, or null if it has none. */
  getCardPricing(id: string): Promise<CardPricing | null>;
  /** Today's prices already on the device for any of `ids`, without fetching the rest. */
  cachedCardPricing(ids: string[]): Promise<Map<string, CardPricing | null>>;
  /** How the set's packs are made up, which says which of its cards packs can hold. */
  profileFor(set: SetDetail): PackProfile | undefined;
  /** The line under a set's name. */
  describeSet(set: SetDetail): string;
  /** The set's logo or symbol. */
  SetMark(props: { set: SetDetail; className?: string }): ReactNode;
  /** What each finish is called. */
  finishName: Record<Finish, string>;
  /** Whether binder slots name the card's rarity, which Magic cards only show by the set symbol's colour. */
  rarityInBinder: boolean;
  /** The binder's footnote: what's left out of completion, and what ✦ marks. */
  binderNote: string;
}

const pokemon: GameCards = {
  getSetCards: (id, onProgress) => client.getSetCards(id, onProgress),
  forgetSetCards: (id) => client.forgetSetCards(id),
  getCardPricing: (id) => client.getCardPricing(id),
  cachedCardPricing: (ids) => client.cachedCardPricing(ids),
  profileFor,
  describeSet: (set) => `${set.serie.name}${set.releaseDate ? ` · ${set.releaseDate.slice(0, 4)}` : ""}`,
  SetMark: ({ set, className }) => <SetLogo logo={set.logo} className={className} alt="" />,
  finishName: { normal: "Normal", holo: "Holo", reverse: "Reverse holo" },
  rarityInBinder: false,
  binderNote: "Faded cards are still missing. “Not in packs” cards (basic energy, cards without scans) don't count toward completion. ✦ marks secret and subset cards.",
};

const mtg: GameCards = {
  getSetCards: (id) => getMtgSet(id),
  forgetSetCards: forgetMtgSet,
  getCardPricing: getMtgCardPricing,
  cachedCardPricing: cachedMtgCardPricing,
  profileFor: (set) => {
    const info = mtgSet(set.id);
    return info && mtgProfile(info);
  },
  describeSet: (set) => {
    const info = mtgSet(set.id);
    const era = info && MTG_ERAS.find((e) => e.id === boosterEra(info))?.name;
    return [set.id.toUpperCase(), era, set.releaseDate?.slice(0, 4)].filter(Boolean).join(" · ");
  },
  SetMark: ({ set, className }) => <img className={`set-symbol ${className ?? ""}`} src={setSymbol(set.id)} alt="" />,
  // A Magic card is just foil or not.
  finishName: { normal: "Non-foil", holo: "Foil", reverse: "Reverse holo" },
  rarityInBinder: true,
  binderNote: "Faded cards are still missing. “Not in packs” cards don't count toward completion. ✦ marks basic lands and printings numbered after the main set.",
};

export const gameCards: GameCards = GAME === "mtg" ? mtg : pokemon;
