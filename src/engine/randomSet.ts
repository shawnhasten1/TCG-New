// Every pack comes from a randomly chosen set: there is no manual set choice for opening.

import type { SetSummary } from "../api/types";
import { hiddenReason } from "./openable";
import { profileFor } from "./profiles";
import type { Rng } from "./rng";

/** Eras the draw can be limited to, keyed by pack profile id. */
export const ERAS = [
  { id: "wotc", name: "Wizards of the Coast (Base–Neo)" },
  { id: "classic", name: "Classic (e-Card–Sun & Moon)" },
  { id: "swsh", name: "Sword & Shield" },
  { id: "sv", name: "Scarlet & Violet / Mega Evolution" },
] as const;

export function eraOf(set: Pick<SetSummary, "id" | "serie">): string | undefined {
  return profileFor(set)?.id;
}

export interface DrawOptions {
  /** Sets that loaded but couldn't fill a pack (id → reason). */
  unopenable?: Record<string, string>;
  /** Limit the draw to these eras; empty or undefined means every era. */
  eras?: string[];
}

/** Sets a pack can be drawn from: the same ones the set list offers, optionally limited by era. */
export function drawableSets(sets: SetSummary[], opts: DrawOptions = {}): SetSummary[] {
  const eras = opts.eras?.length ? new Set(opts.eras) : undefined;
  return sets.filter((s) => {
    if (hiddenReason(s) || opts.unopenable?.[s.id]) return false;
    return !eras || eras.has(eraOf(s) ?? "");
  });
}

/** Picks one set uniformly. `avoid` skips a set (e.g. one that just failed to load) when others exist. */
export function pickRandomSet(sets: SetSummary[], rng: Rng, avoid?: string): SetSummary | undefined {
  const pool = sets.length > 1 && avoid ? sets.filter((s) => s.id !== avoid) : sets;
  return pool.length ? pool[Math.floor(rng() * pool.length)] : undefined;
}
