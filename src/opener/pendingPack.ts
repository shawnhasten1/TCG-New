// The pack on screen but not yet torn: its set and the seed for its cards, kept in localStorage so
// reloading (or leaving and coming back) deals the same pack instead of drawing a new one.
// Cleared once the pack is torn, which is when it's saved to the collection.

const KEY = "tcg:pending-pack";

export interface PendingPack {
  setId: string;
  seed: string;
}

export function loadPendingPack(): PendingPack | undefined {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<PendingPack> | null;
    return typeof p?.setId === "string" && typeof p.seed === "string" ? { setId: p.setId, seed: p.seed } : undefined;
  } catch {
    return undefined;
  }
}

export function savePendingPack(pack: PendingPack): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(pack));
  } catch {
    // Not persisted: a reload draws a new pack, as before.
  }
}

export function clearPendingPack(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
