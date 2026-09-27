// Magic card data from Scryfall (https://scryfall.com/docs/api), in the shapes the pack engine uses.
//
// Findings (2026-09-27):
// - `/cards/search?q=set:<code> is:booster&unique=prints` lists every printing that comes in the set's boosters,
//   showcase and borderless ones included, 175 to a page (two or three pages a set). Each has `rarity` (common,
//   uncommon, rare, mythic, special, bonus), `finishes` (nonfoil, foil, etched) and `type_line`.
// - Scryfall's bulk files are the whole card pool (the smallest with images is ~500 MB of JSON), far more than a
//   Worker can hold. Packs only need a dozen sets, so a set is fetched with a search the first time and kept.
// - The API asks for a User-Agent and Accept header, 50–100 ms between requests, and that data be cached for at
//   least a day. Images on cards.scryfall.io aren't rate limited and may be linked to directly.
// - Double-faced cards have no `image_uris` of their own, only per face. Every image is at
//   cards.scryfall.io/<size>/front/<a>/<b>/<id>.jpg either way, so the card's id is all the image route needs.
// - Every card carries `prices` (usd, usd_foil, usd_etched from TCGplayer; eur, eur_foil from Cardmarket), as strings
//   or null, updated about once a day. The same search gives a whole set's prices, so they're fetched per set.

import type { CardPricing } from "../api/tcgdex";
import type { Card, SetData } from "../api/types";
import { foilEra, type MtgSet } from "./sets";

const API = "https://api.scryfall.com";
const HEADERS = { "User-Agent": "TCGPackOpener/0.1 (+https://tcg.spudfurd.dev)", Accept: "application/json" };

/** The fields of a Scryfall card this uses. */
export interface RawCard {
  id: string;
  name: string;
  collector_number: string;
  rarity: string;
  type_line?: string;
  finishes: string[];
  booster?: boolean;
  image_uris?: unknown;
  card_faces?: { image_uris?: unknown }[];
  prices?: Partial<Record<"usd" | "usd_foil" | "usd_etched" | "eur" | "eur_foil", string | null>>;
}

const RARITY: Record<string, string> = { common: "Common", uncommon: "Uncommon", rare: "Rare", mythic: "Mythic Rare", special: "Special", bonus: "Bonus" };

/** Scryfall's rarity, spelled out; basic lands get their own, so they only fill the land slot. */
export function rarityOf(card: RawCard): string {
  if (/^Basic\b.*\bLand\b/.test(card.type_line ?? "")) return "Basic Land";
  return RARITY[card.rarity] ?? card.rarity;
}

/** Where a card's image is served from (worker/mtg.ts, which sends the browser on to Scryfall); the app adds "/high.webp" or "/low.webp". */
export const cardImageBase = (scryfallId: string) => `/api/mtg/card/${scryfallId}`;

/** A Scryfall image of the card's front: "large" is 672×936, "normal" 488×680. */
export const scryfallImage = (scryfallId: string, size: "large" | "normal") => `https://cards.scryfall.io/${size}/front/${scryfallId[0]}/${scryfallId[1]}/${scryfallId}.jpg`;

/** The set's symbol, as an SVG. */
export const setSymbol = (setId: string) => `https://svgs.scryfall.io/sets/${setId}.svg`;

const hasImage = (c: RawCard) => !!c.image_uris || !!c.card_faces?.some((f) => f.image_uris);

/** Turns Scryfall's cards for one set into the engine's set data, in collector number order. */
export function toSetData(set: MtgSet, raw: RawCard[]): SetData {
  const cards: Card[] = raw
    .filter((c) => c.booster !== false && hasImage(c))
    .map((c) => ({
      id: `${set.id}-${c.collector_number}`,
      localId: c.collector_number,
      name: c.name,
      image: cardImageBase(c.id),
      rarity: rarityOf(c),
      // "holo" is a traditional foil. Etched foils are only in Collector Boosters, so they count as foil here.
      variants: { normal: c.finishes.includes("nonfoil"), holo: c.finishes.includes("foil") || c.finishes.includes("etched"), reverse: false, firstEdition: false },
    }))
    .sort((a, b) => a.localId.localeCompare(b.localId, "en", { numeric: true }));
  const byRarity: Record<string, Card[]> = {};
  for (const c of cards) (byRarity[c.rarity] ??= []).push(c);
  // The main set, without showcase and borderless reprints (numbered after it) or basic lands.
  const official = cards.filter((c) => c.rarity !== "Basic Land" && !/\D/.test(c.localId)).length;

  return {
    set: {
      id: set.id,
      name: set.name,
      releaseDate: set.released,
      // The serie picks the frame layout, so it's the set's foil era: "mtg-premodern", "mtg-modern" or "mtg-dark".
      serie: { id: `mtg-${foilEra(set)}`, name: "Magic: The Gathering" },
      cardCount: { total: cards.length, official },
      cards: [],
    },
    cards,
    byRarity,
    source: "rest-full",
    fetchedAt: new Date().toISOString(),
  };
}

const RANKS = ["Basic Land", "Common", "Uncommon", "Rare", "Mythic Rare", "Special", "Bonus"];
/** Order of rarities, plainest first; unknown ones go last. */
export function rarityRank(rarity: string): number {
  const i = RANKS.indexOf(rarity);
  return i < 0 ? RANKS.length : i;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A set's booster cards as Scryfall has them, a page at a time. */
export async function fetchRawCards(set: MtgSet): Promise<RawCard[]> {
  const raw: RawCard[] = [];
  let url: string | undefined = `${API}/cards/search?q=${encodeURIComponent(`set:${set.id} is:booster`)}&unique=prints&order=set`;
  while (url) {
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} from Scryfall for ${set.name}`);
    const page = (await res.json()) as { data: RawCard[]; has_more: boolean; next_page?: string };
    raw.push(...page.data);
    url = page.has_more ? page.next_page : undefined;
    // Scryfall asks for 50–100 ms between requests.
    if (url) await wait(100);
  }
  if (!raw.length) throw new Error(`Scryfall has no booster cards for ${set.name}`);
  return raw;
}

/** Fetches a set's booster cards from Scryfall. Call rarely: the result should be cached (worker/mtg.ts). */
export const fetchSetData = async (set: MtgSet): Promise<SetData> => toSetData(set, await fetchRawCards(set));

/** Fetches today's prices for a set's cards from Scryfall. Call once a day at most: cache the result (worker/mtg.ts). */
export const fetchSetPrices = async (set: MtgSet): Promise<Record<string, CardPricing>> => toPricing(set, await fetchRawCards(set));

const amount = (v: string | null | undefined) => {
  const n = Number(v);
  return v && n > 0 ? n : undefined;
};

/**
 * Scryfall's prices for a set's cards, by card id, in TCGdex's pricing shape so priceFor reads both games alike:
 * TCGplayer's "normal" and "holofoil" (foil, else etched foil), and Cardmarket's "trend" and "trend-foil".
 * Cards with no price at all are left out.
 */
export function toPricing(set: MtgSet, raw: RawCard[]): Record<string, CardPricing> {
  const out: Record<string, CardPricing> = {};
  for (const c of raw) {
    const p = c.prices ?? {};
    const usd = amount(p.usd);
    const usdFoil = amount(p.usd_foil) ?? amount(p.usd_etched);
    const eur = amount(p.eur);
    const eurFoil = amount(p.eur_foil);
    if (!usd && !usdFoil && !eur && !eurFoil) continue;
    const pricing: CardPricing = {};
    if (usd || usdFoil) {
      pricing.tcgplayer = { unit: "USD" };
      if (usd) pricing.tcgplayer.normal = { marketPrice: usd };
      if (usdFoil) pricing.tcgplayer.holofoil = { marketPrice: usdFoil };
    }
    // "trend-foil" is always set, even to null, so a foil without a euro price isn't given the non-foil one.
    if (eur || eurFoil) pricing.cardmarket = { unit: "EUR", trend: eur ?? null, "trend-foil": eurFoil ?? null };
    out[`${set.id}-${c.collector_number}`] = pricing;
  }
  return out;
}
