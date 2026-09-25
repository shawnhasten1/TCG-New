// The cards a player owns right now: every card in their packs that hasn't been deleted or traded away.

import { cardUid, type RemoteCard } from "../src/sync/protocol";
import type { OwnedCard, TradeCard } from "../src/social/protocol";
import { tcgdex } from "./cache";
import { HttpError, type Ctx } from "./http";

interface PackRow {
  pack_id: string;
  set_id: string;
  opened_at: string;
  cards: string;
}

export async function ownedCards(db: D1Database, userId: string): Promise<OwnedCard[]> {
  const { results } = await db.prepare("SELECT pack_id, set_id, opened_at, cards FROM packs WHERE user_id = ? AND deleted = 0").bind(userId).all<PackRow>();
  const out: OwnedCard[] = [];
  for (const r of results) {
    (JSON.parse(r.cards) as RemoteCard[]).forEach((c, slot) => {
      if (!c.gone) out.push({ uid: cardUid(r.pack_id, slot), setId: r.set_id, cardId: c.cardId, localId: c.localId, finish: c.finish, firstEdition: c.firstEdition, openedAt: r.opened_at });
    });
  }
  return out;
}

/** Card data for each card, from the Worker's TCGdex cache (one set download per set involved, usually cached). */
export async function withCardData(ctx: Ctx, cards: OwnedCard[]): Promise<TradeCard[]> {
  const { client } = tcgdex(ctx.env);
  const sets = new Map(
    await Promise.all(
      [...new Set(cards.map((c) => c.setId))].map(async (id) => {
        try {
          return [id, await client.getSetCards(id)] as const;
        } catch (err) {
          console.error(`Couldn't load ${id}`, err);
          throw new HttpError(503, "Couldn't reach the card database. Try again in a moment.");
        }
      }),
    ),
  );
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
