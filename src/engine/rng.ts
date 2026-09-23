// Seeded random number generation so packs can be replayed in tests.

export type Rng = () => number;

/** Hashes a string seed to a 32-bit integer (xmur3). */
function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** mulberry32: small, fast, good enough for games. Returns floats in [0, 1). */
export function createRng(seed: string | number): Rng {
  let a = typeof seed === "number" ? seed >>> 0 : hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Picks a key from a weight table. Zero and negative weights are never picked. */
export function weightedPick<K extends string>(rng: Rng, weights: Partial<Record<K, number>>): K | undefined {
  let total = 0;
  for (const w of Object.values(weights) as number[]) if (w > 0) total += w;
  if (total <= 0) return undefined;
  let r = rng() * total;
  let last: K | undefined;
  for (const [k, w] of Object.entries(weights) as [K, number][]) {
    if (!(w > 0)) continue;
    last = k;
    if ((r -= w) < 0) return k;
  }
  return last; // floating-point edge
}

export function pickOne<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}
