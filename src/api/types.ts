// Shapes returned by the TCGdex v2 API (only the fields we use).

export interface CardCount {
  total: number;
  official: number;
  normal?: number;
  reverse?: number;
  holo?: number;
  firstEd?: number;
}

export interface SetBrief {
  id: string;
  name: string;
  logo?: string;
  symbol?: string;
  cardCount: { total: number; official: number };
}

/** A set as listed in the picker (from one GraphQL query). */
export interface SetSummary {
  id: string;
  name: string;
  logo?: string | null;
  symbol?: string | null;
  releaseDate: string;
  serie: { id: string; name: string };
  cardCount: { total: number; official: number };
}

export interface CardBrief {
  id: string;
  localId: string;
  name: string;
  image?: string;
}

export interface Booster {
  id: string;
  name: string;
  logo?: string;
  artwork_front?: string;
  artwork_back?: string;
}

export interface SetDetail {
  id: string;
  name: string;
  logo?: string;
  symbol?: string;
  releaseDate?: string;
  serie: { id: string; name: string };
  cardCount: CardCount;
  cards: CardBrief[];
  boosters?: Booster[];
}

export interface SerieDetail {
  id: string;
  name: string;
  logo?: string;
  releaseDate?: string;
  sets: SetBrief[];
}

export interface Variants {
  normal: boolean;
  reverse: boolean;
  holo: boolean;
  firstEdition: boolean;
}

export type CardCategory = "Pokemon" | "Trainer" | "Energy";

/** The card fields the pack engine needs: identity, image, rarity, finishes and card type. */
export interface Card {
  id: string;
  localId: string;
  name: string;
  image?: string;
  rarity: string;
  variants: Variants;
  category?: CardCategory;
  /** "Normal" for basic energy, "Special" otherwise. Energy cards only. */
  energyType?: string | null;
  /** "Supporter", "Item", "Stadium", "Tool"… Trainer cards only (not set for older sets). */
  trainerType?: string | null;
  /** National Pokédex numbers. Pokémon cards only; tag-team cards list several. */
  dexId?: number[] | null;
}

/** A card from a cross-set query, which also says which set it's from. */
export interface CardWithSet extends Card {
  set: { id: string };
}

/** Everything needed to open packs from one set. */
export interface SetData {
  set: SetDetail;
  cards: Card[];
  /** Cards grouped by their exact TCGdex rarity string. */
  byRarity: Record<string, Card[]>;
  /** How the card data was obtained, for the debug page. */
  source: "graphql" | "rest-full";
  fetchedAt: string;
}

export type ImageQuality = "high" | "low";
export type ImageFormat = "webp" | "png" | "jpg";
