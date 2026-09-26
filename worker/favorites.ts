// Favorite cards: GET /api/favorites lists them; PUT or DELETE /api/favorites/<cardId> stars or unstars one.

import { HttpError, json, type Ctx } from "./http";
import { requireUser } from "./session";

/** Plenty for anyone; keeps one account from filling the table. */
const MAX_FAVORITES = 5000;
/** TCGdex card ids: a set id, a dash and a number, e.g. "sv03.5-151", "swsh12pt5gg-GG01" or Unown's "pl2-?". */
const CARD_ID = /^[^/\s]{1,64}$/;

export async function handleFavorites(ctx: Ctx): Promise<Response> {
  const user = await requireUser(ctx);
  const db = ctx.env.DB;
  if (ctx.url.pathname === "/api/favorites") {
    if (ctx.req.method !== "GET") throw new HttpError(405, "Method not allowed");
    const { results } = await db.prepare("SELECT card_id FROM favorites WHERE user_id = ? ORDER BY created_at").bind(user.id).all<{ card_id: string }>();
    return json({ cardIds: results.map((r) => r.card_id) });
  }

  let cardId = "";
  try {
    cardId = decodeURIComponent(ctx.url.pathname.slice("/api/favorites/".length));
  } catch {
    // Left empty, so it's refused below.
  }
  if (!CARD_ID.test(cardId)) throw new HttpError(400, "Bad card id");
  if (ctx.req.method === "PUT") {
    // The count check and insert share a statement, so two quick taps can't both slip past the limit.
    const res = await db
      .prepare("INSERT OR IGNORE INTO favorites (user_id, card_id, created_at) SELECT ?1, ?2, ?3 WHERE (SELECT COUNT(*) FROM favorites WHERE user_id = ?1) < ?4")
      .bind(user.id, cardId, Date.now(), MAX_FAVORITES)
      .run();
    // Nothing added: either it was already a favorite, or the list is full.
    if (!res.meta.changes && !(await db.prepare("SELECT 1 FROM favorites WHERE user_id = ? AND card_id = ?").bind(user.id, cardId).first()))
      throw new HttpError(409, `You can have up to ${MAX_FAVORITES} favorites.`);
    return json({ ok: true });
  }
  if (ctx.req.method === "DELETE") {
    await db.prepare("DELETE FROM favorites WHERE user_id = ? AND card_id = ?").bind(user.id, cardId).run();
    return json({ ok: true });
  }
  throw new HttpError(405, "Method not allowed");
}
