// Yu-Gi-Oh! card data from YGOPRODeck (https://ygoprodeck.com/api-guide/), in the shapes the pack engine uses.
//
// Findings (2026-09-25, 2026-09-27):
// - `cardinfo.php?cardset=<set name>` returns every card in a set in one request, each with all its printings
//   (`card_sets`) across every set. Sends `access-control-allow-origin: *`.
// - A card can be in a set more than once, at different rarities (Phantom Nightmare's Quarter Century Secret Rares
//   reprint its Super, Ultra and Secret Rares; a Rarity Collection prints every card in seven). So a card here is a
//   printing: set code plus rarity.
// - Sets from 2002–2004 list each card under several regional codes (LOB-001, LOB-E001, LOB-EN001). Only the
//   English ("EN") printings are kept, or the unprefixed North American ones for sets that have no EN codes.
// - Each printing has a `set_price` in dollars (TCGplayer's, updated about daily; "0" when there's none), so a whole
//   set's prices come from the same request as its cards.
// - A few printings have a junk rarity ("New", "Cr") or a typo ("PLatinum Secret Rare"); junk is left out.
// - The rate limit is 20 requests a second, and going over blocks the IP for an hour. Data must be stored rather
//   than fetched again, and images must be re-hosted, not hotlinked. The Worker does both (worker/ygo.ts).

import type { CardPricing } from "../api/tcgdex";
import type { Card, SetData } from "../api/types";
import { sourcesOf, type YgoSet } from "./sets";

const API = "https://db.ygoprodeck.com/api/v7";

/** The fields of a YGOPRODeck card this uses. */
export interface RawCard {
  id: number;
  name: string;
  type: string;
  frameType: string;
  card_sets?: { set_name: string; set_code: string; set_rarity: string; set_rarity_code: string; set_price?: string }[];
  card_images: { id: number }[];
}

/** Rarities printed without foil: everything else shines. */
const PLAIN = /^(common|short print|super short print|rare)$/i;
export const isFoilRarity = (rarity: string) => !PLAIN.test(rarity);

/** Real rarities have one of these in their name; the rest are YGOPRODeck placeholders. */
const REAL = /rare|common|print|starfoil/i;
const TYPOS: Record<string, string> = { "PLatinum Secret Rare": "Platinum Secret Rare" };

/** "(QCScR)" → "QCScR"; YGOPRODeck leaves some blank, so those use the rarity's initials. */
export function rarityCode(rarity: string, code: string): string {
  const c = code.replace(/[()\s]/g, "");
  return c || rarity.split(/\s+/).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

/** "PHNI-EN059" → set "PHNI", region "EN" and number "059". */
function splitCode(code: string): { set: string; region: string; number: string } | undefined {
  const m = /^([A-Z0-9]+)-([A-Z]*)(\d+)$/.exec(code);
  return m ? { set: m[1], region: m[2], number: m[3] } : undefined;
}

/** Where a card's image is served from (worker/ygo.ts, which keeps a copy); the app adds "/high.webp" or "/low.webp". */
export const cardImageBase = (setId: string, passcode: number) => `/api/ygo/card/${setId}/${passcode}`;

/** A card's set: ids are "<set code>-<number>-<rarity>", and set codes have no hyphen. */
export const ygoSetOf = (cardId: string) => cardId.slice(0, cardId.indexOf("-"));

interface Printing {
  card: RawCard;
  rarity: string;
  code: string;
  price?: number;
}

/**
 * Every English printing in the set, one per card and rarity, in set order. Each card number's plainest printing is
 * its main one, numbered plainly ("059"), and counts toward completing the set; the same card at a rarer rarity (a
 * Quarter Century Secret Rare reprint, a Rarity Collection's higher rarities) is an extra, numbered "059 QCScR".
 */
function printings(set: YgoSet, raw: RawCard[]): (Printing & { id: string; localId: string })[] {
  const names = new Set(sourcesOf(set));
  const all = raw.flatMap((card) =>
    (card.card_sets ?? [])
      .filter((p) => names.has(p.set_name))
      .map((p) => ({ card, p, code: splitCode(p.set_code), rarity: TYPOS[p.set_rarity] ?? p.set_rarity })),
  );
  const regions = new Set(all.map((x) => x.code?.region));
  const region = regions.has("EN") ? "EN" : "";
  const out = new Map<string, Printing & { id: string; number: string; rc: string }>();
  for (const { card, p, code, rarity } of all) {
    if (!code || code.set !== set.id || code.region !== region || !card.card_images?.length || !REAL.test(rarity)) continue;
    const id = `${p.set_code}-${rarityCode(rarity, p.set_rarity_code)}`;
    if (out.has(id)) continue;
    const price = Number(p.set_price);
    out.set(id, { id, number: code.number, rc: rarityCode(rarity, p.set_rarity_code), card, rarity, code: p.set_code, price: price > 0 ? price : undefined });
  }
  const sorted = [...out.values()].sort((a, b) => a.number.localeCompare(b.number, "en", { numeric: true }) || rarityRank(a.rarity) - rarityRank(b.rarity));
  return sorted.map(({ number, rc, ...p }, i) => ({ ...p, localId: i > 0 && sorted[i - 1].number === number ? `${number} ${rc}` : number }));
}

/** Turns YGOPRODeck's cards for one set into the engine's set data: one card per printing, in set order. */
export function toSetData(set: YgoSet, raw: RawCard[]): SetData {
  const cards = printings(set, raw).map(({ id, localId, card, rarity }): Card => {
    const foil = isFoilRarity(rarity);
    return {
      id,
      localId,
      name: card.name,
      image: cardImageBase(set.id, card.card_images[0].id),
      rarity,
      // A printing is foil or not by its rarity, and the engine keeps each card to the finishes it has.
      variants: { normal: !foil, holo: foil, reverse: false, firstEdition: false },
      passcode: card.id,
      frameType: card.frameType,
    };
  });
  const byRarity: Record<string, Card[]> = {};
  for (const c of cards) (byRarity[c.rarity] ??= []).push(c);

  return {
    set: {
      id: set.id,
      name: set.name,
      releaseDate: set.released,
      serie: { id: "ygo", name: "Yu-Gi-Oh!" },
      // "Official" counts main printings (card numbers), which are the ones numbered plainly.
      cardCount: { total: cards.length, official: cards.filter((c) => /^\d+$/.test(c.localId)).length },
      cards: [],
    },
    cards,
    byRarity,
    source: "rest-full",
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * A set's prices, by card id, in TCGdex's pricing shape so priceFor reads every game alike: each printing's TCGplayer
 * price under its one finish ("holofoil" for foil rarities, "normal" for the rest). Cards with no price are left out.
 */
export function toPricing(set: YgoSet, raw: RawCard[]): Record<string, CardPricing> {
  const out: Record<string, CardPricing> = {};
  for (const p of printings(set, raw)) {
    if (!p.price) continue;
    out[p.id] = { tcgplayer: { unit: "USD", [isFoilRarity(p.rarity) ? "holofoil" : "normal"]: { marketPrice: p.price } } };
  }
  return out;
}

const RANKS = [
  "Common",
  "Short Print",
  "Super Short Print",
  "Rare",
  "Duel Terminal Normal Parallel Rare",
  "Starfoil",
  "Starfoil Rare",
  "Mosaic Rare",
  "Shatterfoil Rare",
  "Duel Terminal Rare Parallel Rare",
  "Duel Terminal Normal Rare Parallel Rare",
  "Super Rare",
  "Duel Terminal Super Parallel Rare",
  "Ultra Rare",
  "Duel Terminal Ultra Parallel Rare",
  "Ultra Rare (Pharaoh's Rare)",
  "Secret Rare",
  "Prismatic Secret Rare",
  "Ultimate Rare",
  "Collector's Rare",
  "Platinum Secret Rare",
  "Ghost Rare",
  "Starlight Rare",
  "Quarter Century Secret Rare",
];
/** Order of rarities, plainest first; unknown ones go last. */
export function rarityRank(rarity: string): number {
  const i = RANKS.indexOf(rarity);
  return i < 0 ? RANKS.length : i;
}

/** How to reach YGOPRODeck: plain fetch in scripts, a rate-limited one in the Worker (worker/ygo.ts). */
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/** A set's cards as YGOPRODeck has them, from every name it lists them under. */
export async function fetchRawCards(set: YgoSet, fetcher: Fetcher = fetch): Promise<RawCard[]> {
  const raw: RawCard[] = [];
  for (const name of sourcesOf(set)) {
    const res = await fetcher(`${API}/cardinfo.php?cardset=${encodeURIComponent(name)}`);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} from YGOPRODeck for ${name}`);
    const { data } = (await res.json()) as { data?: RawCard[] };
    raw.push(...(data ?? []));
  }
  if (!raw.length) throw new Error(`YGOPRODeck has no cards for ${set.name}`);
  return raw;
}

/** Fetches a set's cards from YGOPRODeck. Call rarely: the result should be cached (worker/ygo.ts). */
export const fetchSetData = async (set: YgoSet, fetcher: Fetcher = fetch): Promise<SetData> => toSetData(set, await fetchRawCards(set, fetcher));

/** Fetches today's prices for a set's cards. Call once a day at most: cache the result (worker/ygo.ts). */
export const fetchSetPrices = async (set: YgoSet, fetcher: Fetcher = fetch): Promise<Record<string, CardPricing>> => toPricing(set, await fetchRawCards(set, fetcher));

