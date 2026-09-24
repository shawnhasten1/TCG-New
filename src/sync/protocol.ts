// The collection sync protocol, shared by the app and the Worker (worker/). Packs are the unit of sync:
// a pack's id is made on the device that opened it, so adding the same pack twice is harmless.

import type { Finish } from "../engine/types";

export interface SyncCard {
  cardId: string;
  localId: string;
  finish: Finish;
  firstEdition: boolean;
}

export interface SyncPack {
  packId: string;
  setId: string;
  /** ISO timestamp. */
  openedAt: string;
  cards: SyncCard[];
}

/**
 * One change pushed from a device, applied in order. "open" opens a pack the server dealt (see packs/protocol.ts).
 * "add" is from before the server dealt packs: outboxes may still hold one, but the server ignores it.
 */
export type SyncOp = { op: "open"; packId: string } | { op: "add"; packs: SyncPack[] } | { op: "deletePacks"; packIds: string[] } | { op: "deleteSet"; setId: string } | { op: "clear" };

/** A pack as the server reports it; deleted packs come back empty so other devices drop them too. */
export interface RemotePack extends SyncPack {
  deleted: boolean;
}

export interface ChangesResponse {
  packs: RemotePack[];
  /** Pass back as `since` to get only what changed after this page. */
  cursor: string | null;
  more: boolean;
}

export interface PushRequest {
  ops: SyncOp[];
}

export interface PublicUser {
  id: string;
  /** Null for a guest. */
  email: string | null;
  /** A silent account made on a first visit, with no way to sign in again; signing up or in keeps its cards. */
  guest: boolean;
  name: string | null;
  avatarUrl: string | null;
  hasPassword: boolean;
  hasGoogle: boolean;
}

export interface MeResponse {
  user: PublicUser | null;
  /** Whether Google sign-in is set up on the server. */
  google: boolean;
}

/** Most packs one push may carry, across all its ops. */
export const MAX_PUSH_PACKS = 200;
const MAX_OPS = 50;
const MAX_CARDS = 60;

const FINISHES = new Set<string>(["normal", "holo", "reverse"]);
const id = (v: unknown, max = 120): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

function parseCard(v: unknown): SyncCard {
  const c = v as Partial<SyncCard>;
  if (!c || !id(c.cardId) || typeof c.localId !== "string" || c.localId.length > 40 || !FINISHES.has(c.finish as string) || typeof c.firstEdition !== "boolean") throw new Error("Malformed card");
  return { cardId: c.cardId, localId: c.localId, finish: c.finish!, firstEdition: c.firstEdition };
}

function parsePack(v: unknown): SyncPack {
  const p = v as Partial<SyncPack>;
  if (!p || !id(p.packId, 64) || !id(p.setId) || !id(p.openedAt, 40) || isNaN(Date.parse(p.openedAt)) || !Array.isArray(p.cards) || p.cards.length > MAX_CARDS) throw new Error("Malformed pack");
  return { packId: p.packId, setId: p.setId, openedAt: p.openedAt, cards: p.cards.map(parseCard) };
}

/** Validates a push body. Throws an Error on anything malformed or too large. */
export function parsePush(body: unknown): SyncOp[] {
  const ops = (body as Partial<PushRequest> | null)?.ops;
  if (!Array.isArray(ops) || ops.length > MAX_OPS) throw new Error("Expected a list of ops");
  let packs = 0;
  const parsed = ops.map((raw): SyncOp => {
    const o = raw as Record<string, unknown>;
    switch (o?.op) {
      case "add": {
        if (!Array.isArray(o.packs)) throw new Error("Malformed add");
        packs += o.packs.length;
        return { op: "add", packs: o.packs.map(parsePack) };
      }
      case "deletePacks": {
        if (!Array.isArray(o.packIds) || !o.packIds.every((p) => id(p, 64))) throw new Error("Malformed delete");
        packs += o.packIds.length;
        return { op: "deletePacks", packIds: o.packIds as string[] };
      }
      case "open":
        if (!id(o.packId, 64)) throw new Error("Malformed open");
        return { op: "open", packId: o.packId };
      case "deleteSet":
        if (!id(o.setId)) throw new Error("Malformed delete");
        return { op: "deleteSet", setId: o.setId };
      case "clear":
        return { op: "clear" };
      default:
        throw new Error("Unknown op");
    }
  });
  if (packs > MAX_PUSH_PACKS) throw new Error("Too many packs in one push");
  return parsed;
}
