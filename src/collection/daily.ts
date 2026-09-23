// "Pack of the day" pacing. Packs opened today are counted from the collection itself,
// so there's no separate counter to drift or reset by accident. Days roll over at local midnight.
// Each day starts with `limit` packs. Once they run out, one pack recharges every RECHARGE_MS,
// stacking back up to the limit; midnight refills the lot.

import type { PullRecord } from "./store";

/** How long one pack takes to recharge once you've run out. */
export const RECHARGE_MS = 2 * 60 * 1000;

/** Local calendar day, YYYY-MM-DD. */
export function localDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Distinct packs opened on a local day. */
export function packsOpenedOn(pulls: Pick<PullRecord, "packId" | "openedAt">[], day: string): number {
  return new Set(pulls.filter((p) => localDay(new Date(p.openedAt)) === day).map((p) => p.packId)).size;
}

export interface Allowance {
  /** Packs that can be opened right now; Infinity when unlimited (limit 0). */
  left: number;
  /** When the next pack recharges, if one is recharging. */
  nextAt?: Date;
}

/** Packs available at `now` under a daily limit with recharge. */
export function packAllowance(pulls: Pick<PullRecord, "packId" | "openedAt">[], limit: number, now: Date): Allowance {
  if (limit <= 0) return { left: Infinity };
  const day = localDay(now);
  const opened = new Map<string, number>();
  for (const p of pulls) {
    const t = Date.parse(p.openedAt);
    if (t > now.getTime() || localDay(new Date(t)) !== day) continue;
    opened.set(p.packId, Math.min(t, opened.get(p.packId) ?? t));
  }

  let left = limit;
  /** Start of the pack currently recharging; set once the day's packs run out, cleared when full again. */
  let chargeFrom: number | undefined;
  const recharge = (t: number) => {
    if (chargeFrom === undefined) return;
    const gained = Math.floor((t - chargeFrom) / RECHARGE_MS);
    left = Math.min(limit, left + gained);
    chargeFrom = left === limit ? undefined : chargeFrom + gained * RECHARGE_MS;
  };
  for (const t of [...opened.values()].sort((a, b) => a - b)) {
    recharge(t);
    left = Math.max(0, left - 1);
    if (left === 0 && chargeFrom === undefined) chargeFrom = t;
  }
  recharge(now.getTime());

  if (chargeFrom === undefined) return { left };
  // Midnight refills everything, which can beat the next recharge.
  return { left, nextAt: new Date(Math.min(chargeFrom + RECHARGE_MS, nextReset(now).getTime())) };
}

/** The next local midnight after `now`. */
export function nextReset(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
}

/** "5h 12m", "12m 30s" or "45s". */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s % 60}s`;
  return `${s}s`;
}
