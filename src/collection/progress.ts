// Pure collection maths: ownership per card and completion per set.

import type { Card } from "../api/types";
import type { Finish } from "../engine/types";
import { isOpenedPack } from "../sync/protocol";
import type { PullRecord } from "./store";

/** Packs opened, from their cards; cards received in trades don't count as packs. */
export const countPacks = (pulls: Pick<PullRecord, "packId">[]) => new Set(pulls.filter((p) => isOpenedPack(p.packId)).map((p) => p.packId)).size;

export interface Ownership {
  cardId: string;
  total: number;
  byFinish: Record<Finish, number>;
  firstEdition: number;
  firstPulledAt: string;
  lastPulledAt: string;
}

export function ownership(pulls: PullRecord[]): Map<string, Ownership> {
  const out = new Map<string, Ownership>();
  for (const p of pulls) {
    let o = out.get(p.cardId);
    if (!o) {
      o = { cardId: p.cardId, total: 0, byFinish: { normal: 0, holo: 0, reverse: 0 }, firstEdition: 0, firstPulledAt: p.openedAt, lastPulledAt: p.openedAt };
      out.set(p.cardId, o);
    }
    o.total++;
    o.byFinish[p.finish]++;
    if (p.firstEdition) o.firstEdition++;
    if (p.openedAt < o.firstPulledAt) o.firstPulledAt = p.openedAt;
    if (p.openedAt > o.lastPulledAt) o.lastPulledAt = p.openedAt;
  }
  return out;
}

/** Main-set cards are numbered 1…official; secrets and subsets (TG01, SV001…) are extras. */
export function isMainSet(localId: string, official: number): boolean {
  return /^\d+$/.test(localId) && Number(localId) >= 1 && Number(localId) <= official;
}

export interface SetProgress {
  /** Main-set cards owned / pullable. */
  mainOwned: number;
  mainTotal: number;
  /** Every pullable card, secrets included. */
  allOwned: number;
  allTotal: number;
  /** Main-set completion, 0–100. */
  percent: number;
  pulls: number;
  packs: number;
  /** Pulls beyond the first copy of each card. */
  duplicates: number;
}

/**
 * Completion for one set. Cards that packs can't produce (basic energy, no image, rarities no
 * slot uses) are left out of the totals so 100% stays reachable.
 */
export function setProgress(cards: Card[], official: number, pulls: PullRecord[], pullable: Set<string>): SetProgress {
  const owned = ownership(pulls);
  const counted = cards.filter((c) => pullable.has(c.id));
  const main = counted.filter((c) => isMainSet(c.localId, official));
  const mainOwned = main.filter((c) => owned.has(c.id)).length;
  return {
    mainOwned,
    mainTotal: main.length,
    allOwned: counted.filter((c) => owned.has(c.id)).length,
    allTotal: counted.length,
    percent: main.length ? (mainOwned / main.length) * 100 : 0,
    pulls: pulls.length,
    packs: countPacks(pulls),
    duplicates: pulls.length - owned.size,
  };
}

export interface SetTally {
  setId: string;
  pulls: number;
  packs: number;
  /** Distinct main-set numbers owned (by localId, so no set data is needed). */
  mainOwned: number;
  lastOpenedAt: string;
}

/** Per-set counts from pull records alone, for the picker and the collection overview. */
export function tallyBySet(pulls: PullRecord[], official: (setId: string) => number | undefined): Map<string, SetTally> {
  const groups = new Map<string, PullRecord[]>();
  for (const p of pulls) (groups.get(p.setId) ?? groups.set(p.setId, []).get(p.setId)!).push(p);
  const out = new Map<string, SetTally>();
  for (const [setId, ps] of groups) {
    const off = official(setId) ?? Infinity;
    out.set(setId, {
      setId,
      pulls: ps.length,
      packs: countPacks(ps),
      mainOwned: new Set(ps.filter((p) => isMainSet(p.localId, off)).map((p) => p.cardId)).size,
      lastOpenedAt: ps.reduce((m, p) => (p.openedAt > m ? p.openedAt : m), ""),
    });
  }
  return out;
}
