// Card data and owned cards on the server, for any game. Set data comes from TCGdex for Pokémon and Scryfall for Magic
// (worker/mtg.ts), both cached in D1, so the market, trades and the feed needn't know which game they're serving.

import type { CardPricing } from "../src/api/tcgdex";
import type { SetData } from "../src/api/types";
import type { Game } from "../src/game";
import { mtgSet } from "../src/mtg/sets";
import { cardUid, type RemoteCard } from "../src/sync/protocol";
import type { OwnedCard, TradeCard } from "../src/social/protocol";
import { tcgdex } from "./cache";
import { HttpError, type Ctx } from "./http";
import { mtgSetData, mtgSetPrices } from "./mtg";

interface PackRow {
  pack_id: string;
  set_id: string;
  opened_at: string;
  cards: string;
}

/** A set's cards, for any game. Throws a 503 if the card database can't be reached. */
export async function setCards(ctx: Ctx, game: Game, setId: string): Promise<SetData> {
  if (game === "mtg") {
    const set = mtgSet(setId);
    if (!set) throw new HttpError(404, "No such set");
    return mtgSetData(ctx.env, set);
  }
  try {
    return await tcgdex(ctx.env).client.getSetCards(setId);
  } catch (err) {
    console.error(`Couldn't load ${setId}`, err);
    throw new HttpError(503, "Couldn't reach the card database. Try again in a moment.");
  }
}

/** Today's prices for one card, or null if it has none. Throws if they can't be looked up. */
export async function cardPricing(ctx: Ctx, game: Game, setId: string, cardId: string): Promise<CardPricing | null> {
  if (game === "mtg") {
    const set = mtgSet(setId);
    return set ? ((await mtgSetPrices(ctx.env, set))[cardId] ?? null) : null;
  }
  return tcgdex(ctx.env).client.getCardPricing(cardId);
}

/** The cards a player owns in one game right now: every card in their packs that hasn't been deleted, traded or sold. */
export async function ownedCards(db: D1Database, userId: string, game: Game): Promise<OwnedCard[]> {
  const { results } = await db.prepare("SELECT pack_id, set_id, opened_at, cards FROM packs WHERE user_id = ? AND game = ? AND deleted = 0").bind(userId, game).all<PackRow>();
  const out: OwnedCard[] = [];
  for (const r of results) {
    (JSON.parse(r.cards) as RemoteCard[]).forEach((c, slot) => {
      if (!c.gone) out.push({ uid: cardUid(r.pack_id, slot), setId: r.set_id, cardId: c.cardId, localId: c.localId, finish: c.finish, firstEdition: c.firstEdition, openedAt: r.opened_at });
    });
  }
  return out;
}

/** Card data for each card, from the Worker's cache (one set download per set involved, usually cached). */
export async function withCardData(ctx: Ctx, game: Game, cards: OwnedCard[]): Promise<TradeCard[]> {
  const sets = new Map(await Promise.all([...new Set(cards.map((c) => c.setId))].map(async (id) => [id, await setCards(ctx, game, id)] as const)));
  return cards.map((c) => {
    const data = sets.get(c.setId)!;
    const card = data.cards.find((x) => x.id === c.cardId);
    if (!card) throw new HttpError(503, "Couldn't find one of those cards in the card database. Try again in a while.");
    return {
      uid: c.uid,
      finish: c.finish,
      firstEdition: c.firstEdition,
      card,
      set: { id: data.set.id, name: data.set.name, serieId: data.set.serie.id, official: data.set.cardCount.official },
    };
  });
}
