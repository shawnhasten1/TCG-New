// Packs are dealt and opened by the server (worker/packs.ts), so every card in a collection came from a real pack.
// Shared by the app and the Worker.
//
// The flow: the app asks for a pack (deal), which the server rolls and holds for that player until it's torn.
// Reloading or asking again gets the same pack back, so it can't be rerolled. Tearing it opens it: the pack
// joins the collection, through the sync outbox ({ op: "open" }) or the next deal's `opened`, whichever lands first.

import type { SyncCard } from "../sync/protocol";

/** Packs you can hold at once. */
export const PACK_LIMIT = 10;
/** Once below the limit, one pack comes back this often. */
export const RECHARGE_MS = 2 * 60 * 1000;
/** Opens older than this can't affect the allowance (it refills fully in PACK_LIMIT × RECHARGE_MS). */
export const ALLOWANCE_WINDOW_MS = 6 * 60 * 60 * 1000;

export interface Allowance {
  /** Packs that can be opened right now. */
  left: number;
  limit: number;
  /** When the next pack comes back (ms), or null when full. */
  nextAt: number | null;
}

/**
 * Packs available at `now`, given when packs were opened (ms, any order). A bucket of `limit` packs:
 * each open takes one, and while it's below the limit one comes back every RECHARGE_MS.
 */
export function packAllowance(openedAt: number[], now: number, limit = PACK_LIMIT): Allowance {
  let left = limit;
  /** When the pack now recharging started; undefined while full. */
  let chargeFrom: number | undefined;
  const recharge = (t: number) => {
    if (chargeFrom === undefined) return;
    const gained = Math.floor((t - chargeFrom) / RECHARGE_MS);
    left = Math.min(limit, left + gained);
    chargeFrom = left === limit ? undefined : chargeFrom + gained * RECHARGE_MS;
  };
  for (const t of openedAt.filter((t) => t <= now).sort((a, b) => a - b)) {
    recharge(t);
    left = Math.max(0, left - 1);
    chargeFrom ??= t;
  }
  recharge(now);
  return { left, limit, nextAt: chargeFrom === undefined ? null : chargeFrom + RECHARGE_MS };
}

/** A card in a dealt pack. `slot` and `outcome` are the engine's, for the reveal. */
export interface DealtCard extends SyncCard {
  slot: string;
  outcome: string;
}

export interface DealtPack {
  /** Becomes the pack id once opened. */
  dealId: string;
  setId: string;
  cards: DealtCard[];
}

export interface DealRequest {
  /** Eras to draw from (pack profile ids); empty means every era. */
  eras?: string[];
  /** A pack just torn here; it's opened before the next is dealt. */
  opened?: string;
}

export interface DealResponse {
  /** Null when out of packs; `allowance.nextAt` says when to ask again. */
  pack: DealtPack | null;
  /** Counted before this pack is torn. */
  allowance: Allowance;
}
