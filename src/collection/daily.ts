// Day counting and countdowns for the pack allowance. The allowance itself is enforced by the server
// (see packs/protocol.ts).

import type { PullRecord } from "./store";

/** Local calendar day, YYYY-MM-DD. */
export function localDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Distinct packs opened on a local day. */
export function packsOpenedOn(pulls: Pick<PullRecord, "packId" | "openedAt">[], day: string): number {
  return new Set(pulls.filter((p) => localDay(new Date(p.openedAt)) === day).map((p) => p.packId)).size;
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
