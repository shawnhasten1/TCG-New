// The cards a player owns right now: every card in their packs that hasn't been deleted or traded away.

import { cardUid, type RemoteCard } from "../src/sync/protocol";
import type { OwnedCard } from "../src/social/protocol";

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
