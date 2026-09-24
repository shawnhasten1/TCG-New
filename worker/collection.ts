// Collection sync: devices push their changes (ops) and pull everything that changed since their cursor.

import { parsePush, type ChangesResponse, type RemotePack, type SyncOp } from "../src/sync/protocol";
import { HttpError, json, readJson, type Ctx } from "./http";
import { openStatements } from "./packs";
import { requireUser } from "./session";

const PAGE = 300;

export async function handleCollection(ctx: Ctx): Promise<Response> {
  const user = await requireUser(ctx);
  if (ctx.req.method === "GET") return changes(ctx, user.id);
  if (ctx.req.method === "POST") return push(ctx, user.id);
  throw new HttpError(405, "Method not allowed");
}

/* ---------- Pull ---------- */

// Cursor: "<seq>:<packId>" of the last pack sent. Bulk deletes give many packs one seq, so the pack id breaks ties.
function parseCursor(v: string | null): [number, string] {
  if (!v) return [0, ""];
  const i = v.indexOf(":");
  const seq = Number(v.slice(0, i));
  if (i < 0 || !Number.isInteger(seq)) throw new HttpError(400, "Bad cursor");
  return [seq, v.slice(i + 1)];
}

interface PackRow {
  pack_id: string;
  set_id: string;
  opened_at: string;
  cards: string;
  deleted: number;
  seq: number;
}

async function changes(ctx: Ctx, userId: string): Promise<Response> {
  const since = ctx.url.searchParams.get("since");
  const [seq, packId] = parseCursor(since);
  const { results } = await ctx.env.DB.prepare(
    "SELECT pack_id, set_id, opened_at, cards, deleted, seq FROM packs WHERE user_id = ? AND (seq, pack_id) > (?, ?) ORDER BY seq, pack_id LIMIT ?",
  )
    .bind(userId, seq, packId, PAGE + 1)
    .all<PackRow>();
  const page = results.slice(0, PAGE);
  const last = page.at(-1);
  const packs: RemotePack[] = page.map((r) => ({ packId: r.pack_id, setId: r.set_id, openedAt: r.opened_at, cards: JSON.parse(r.cards), deleted: !!r.deleted }));
  return json({ packs, cursor: last ? `${last.seq}:${last.pack_id}` : since, more: results.length > PAGE } satisfies ChangesResponse);
}

/* ---------- Push ---------- */

// Every change takes the user's next seq. Inside one statement the subquery is read once, so a bulk delete shares one seq.
const NEXT_SEQ = "(SELECT COALESCE(MAX(seq), 0) + 1 FROM packs WHERE user_id = ?1)";

function statements(ctx: Ctx, userId: string, op: SyncOp): D1PreparedStatement[] {
  const db = ctx.env.DB;
  const tombstone = `UPDATE packs SET deleted = 1, cards = '[]', seq = ${NEXT_SEQ} WHERE user_id = ?1 AND deleted = 0`;
  switch (op.op) {
    case "open":
      return openStatements(db, userId, op.packId);
    case "add":
      // Packs only come from the server now, so a pack made on a device isn't taken.
      return [];
    case "deletePacks":
      return op.packIds.map((id) => db.prepare(`${tombstone} AND pack_id = ?2`).bind(userId, id));
    case "deleteSet":
      return [db.prepare(`${tombstone} AND set_id = ?2`).bind(userId, op.setId)];
    case "clear":
      return [db.prepare(tombstone).bind(userId)];
  }
}

async function push(ctx: Ctx, userId: string): Promise<Response> {
  let ops: SyncOp[];
  try {
    ops = parsePush(await readJson(ctx.req));
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, err instanceof Error ? err.message : "Bad request");
  }
  const batch = ops.flatMap((op) => statements(ctx, userId, op));
  // One batch is one transaction: the whole push lands, or none of it does.
  if (batch.length) await ctx.env.DB.batch(batch);
  return json({ ok: true });
}
