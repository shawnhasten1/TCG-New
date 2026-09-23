// TCGdex API module: list sets, get a set, get a set's cards grouped by rarity.
//
// Findings from probing the API (2026-09-22):
// - REST `/cards?set.id=eq:<id>&rarity=eq:A|B` filtering works, but returns briefs only
//   (no rarity/variants), so buckets would need one request per rarity.
// - GraphQL `cards(filters:{id:"<setId>-"})` returns rarity + variants for every card,
//   100 per page. A ~200-card set is 3 requests, so this is the primary path.
// - GraphQL nulls out cards whose rarity is missing; those (and everything, if GraphQL
//   fails) are fetched one-by-one over REST as the fallback.
// - Both api.tcgdex.net and assets.tcgdex.net send `access-control-allow-origin: *`.

import { memoryCache, type Cache } from "./cache";
import type {
  Card,
  ImageFormat,
  ImageQuality,
  SerieDetail,
  SetBrief,
  SetData,
  SetDetail,
  SetSummary,
  CardWithSet,
} from "./types";

const REST = "https://api.tcgdex.net/v2/en";
const GRAPHQL = "https://api.tcgdex.net/v2/graphql";
const GRAPHQL_PAGE = 100;
const CACHE_VERSION = 3; // 2: cards gained category / energyType / trainerType. 3: dexId

export type Progress = (done: number, total: number) => void;

export interface TcgdexClient {
  listSets(): Promise<SetBrief[]>;
  /** Every set with serie and release date, in one GraphQL request. Cached per day. */
  listSetSummaries(): Promise<SetSummary[]>;
  getSerie(id: string): Promise<SerieDetail>;
  getSet(id: string): Promise<SetDetail>;
  getSetCards(id: string, onProgress?: Progress): Promise<SetData>;
  /** Every printing of one Pokémon across all sets (by National Pokédex number). Cached per day. */
  getPokemonCards(dexId: number): Promise<CardWithSet[]>;
  /** Market prices for one card (REST only; GraphQL has no pricing). Cached per day. */
  getCardPricing(id: string): Promise<CardPricing | null>;
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

/** Fetches JSON, retrying rate limits and transient server errors with backoff. */
async function getJson<T>(url: string, init?: RequestInit, attempts = 5): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    let res: Response | undefined;
    try {
      res = await fetch(url, init);
    } catch (err) {
      if (attempt >= attempts) throw err;
    }
    if (res?.ok) return (await res.json()) as T;
    if (res && (!RETRYABLE.has(res.status) || attempt >= attempts)) {
      throw new Error(`${res.status} ${res.statusText} for ${url}`);
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1) + Math.random() * 250));
  }
}

/** Runs `fn` over `items` with at most `limit` in flight. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** TCGdex pricing: TCGplayer (USD, by printing) and Cardmarket (EUR, "-holo" fields = foil). */
export interface CardPricing {
  tcgplayer?: { unit?: string; updated?: string } & Record<string, unknown>;
  cardmarket?: { unit?: string; updated?: string } & Record<string, unknown>;
}

export function groupByRarity(cards: Card[]): Record<string, Card[]> {
  const out: Record<string, Card[]> = {};
  for (const c of cards) (out[c.rarity] ??= []).push(c);
  return out;
}

interface GqlCard extends Card {
  set: { id: string };
}

async function graphql<T>(query: string): Promise<T> {
  const res = await getJson<{ data?: T; errors?: unknown[] }>(GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.data) throw new Error("GraphQL error: " + JSON.stringify(res.errors).slice(0, 300));
  return res.data;
}

async function fetchCardsGraphql(setId: string, onProgress?: Progress, expected = 0): Promise<Card[]> {
  const cards: Card[] = [];
  for (let page = 1; ; page++) {
    const query = `{ cards(filters:{ id: ${JSON.stringify(setId + "-")} }, pagination:{ page:${page}, count:${GRAPHQL_PAGE} }) {
      id localId name image rarity category energyType trainerType dexId set { id } variants { normal reverse holo firstEdition } } }`;
    const pageCards = (await graphql<{ cards: (GqlCard | null)[] }>(query)).cards ?? [];
    for (const c of pageCards) {
      if (c && c.set?.id === setId) {
        const { set: _set, ...card } = c;
        cards.push(card);
      }
    }
    onProgress?.(cards.length, Math.max(expected, cards.length));
    if (pageCards.length < GRAPHQL_PAGE) break;
  }
  return cards;
}

interface RestCard {
  id: string;
  localId: string;
  name: string;
  image?: string;
  rarity?: string;
  variants?: Partial<Card["variants"]>;
  category?: Card["category"];
  energyType?: string;
  trainerType?: string;
  dexId?: number[];
}

function fromRest(c: RestCard): Card {
  return {
    id: c.id,
    localId: c.localId,
    name: c.name,
    image: c.image,
    rarity: c.rarity ?? "None",
    category: c.category,
    energyType: c.energyType ?? null,
    trainerType: c.trainerType ?? null,
    dexId: c.dexId ?? null,
    variants: {
      normal: !!c.variants?.normal,
      reverse: !!c.variants?.reverse,
      holo: !!c.variants?.holo,
      firstEdition: !!c.variants?.firstEdition,
    },
  };
}

export function createClient(cache: Cache = memoryCache()): TcgdexClient {
  async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const k = `v${CACHE_VERSION}:${key}`;
    const hit = await cache.get<T>(k);
    if (hit !== undefined) return hit;
    const value = await load();
    await cache.set(k, value);
    return value;
  }

  const client: TcgdexClient = {
    listSets: () => cached("sets", () => getJson<SetBrief[]>(`${REST}/sets`)),

    listSetSummaries: () =>
      cached(`set-summaries:${new Date().toISOString().slice(0, 10)}`, async () => {
        const { sets } = await graphql<{ sets: SetSummary[] }>(
          "{ sets { id name logo symbol releaseDate serie { id name } cardCount { total official } } }",
        );
        return sets.filter(Boolean);
      }),

    getSerie: (id) => cached(`serie:${id}`, () => getJson<SerieDetail>(`${REST}/series/${encodeURIComponent(id)}`)),

    getSet: (id) => cached(`set:${id}`, () => getJson<SetDetail>(`${REST}/sets/${encodeURIComponent(id)}`)),

    getSetCards: (id, onProgress) =>
      cached(`setcards:${id}`, async () => {
        const set = await client.getSet(id);
        const total = set.cards.length;
        let cards: Card[] = [];
        let source: SetData["source"] = "graphql";
        try {
          cards = await fetchCardsGraphql(id, onProgress, total);
        } catch (err) {
          console.warn(`GraphQL failed for ${id}, falling back to REST`, err);
          source = "rest-full";
        }
        // Fill in anything GraphQL missed (e.g. cards with no rarity) over REST.
        const have = new Set(cards.map((c) => c.id));
        const missing = set.cards.filter((b) => !have.has(b.id));
        if (missing.length) {
          if (cards.length === 0) source = "rest-full";
          let done = cards.length;
          const extra = await mapLimit(missing, 8, async (b) => {
            const c = fromRest(await getJson<RestCard>(`${REST}/cards/${encodeURIComponent(b.id)}`));
            onProgress?.(++done, total);
            return c;
          });
          cards.push(...extra);
        }
        const order = new Map(set.cards.map((b, i) => [b.id, i]));
        cards.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
        return { set, cards, byRarity: groupByRarity(cards), source, fetchedAt: new Date().toISOString() };
      }),

    getPokemonCards: (dexId) =>
      cached(`pokemon:${dexId}:${new Date().toISOString().slice(0, 10)}`, async () => {
        const cards: CardWithSet[] = [];
        for (let page = 1; ; page++) {
          const query = `{ cards(filters:{ dexId: ${Math.trunc(dexId)} }, pagination:{ page:${page}, count:${GRAPHQL_PAGE} }) {
            id localId name image rarity category dexId set { id } variants { normal reverse holo firstEdition } } }`;
          const got = (await graphql<{ cards: (CardWithSet | null)[] }>(query)).cards ?? [];
          // The filter is loose, so keep exact matches only (tag teams list several numbers).
          for (const c of got) if (c?.dexId?.includes(dexId)) cards.push(c);
          if (got.length < GRAPHQL_PAGE) break;
        }
        return cards;
      }),

    getCardPricing: (id) =>
      cached(`pricing:${id}:${new Date().toISOString().slice(0, 10)}`, async () => {
        const card = await getJson<{ pricing?: CardPricing }>(`${REST}/cards/${encodeURIComponent(id)}`);
        return card.pricing ?? null;
      }),
  };
  return client;
}

/** Checks that REST filtering by set.id + rarity returns the same bucket sizes as our data. */
export async function probeRestFilter(data: SetData): Promise<{ rarity: string; expected: number; rest: number }[]> {
  return mapLimit(Object.entries(data.byRarity), 4, async ([rarity, cards]) => {
    const url = `${REST}/cards?set.id=eq:${encodeURIComponent(data.set.id)}&rarity=eq:${encodeURIComponent(rarity)}`;
    const rest = await getJson<unknown[]>(url).then((r) => r.length, () => -1);
    return { rarity, expected: cards.length, rest };
  });
}

export function cardImage(card: { image?: string }, quality: ImageQuality = "low", format: ImageFormat = "webp"): string | undefined {
  return card.image ? `${card.image}/${quality}.${format}` : undefined;
}

export function assetImage(base: string | undefined, format: "webp" | "png" = "webp"): string | undefined {
  return base ? `${base}.${format}` : undefined;
}
