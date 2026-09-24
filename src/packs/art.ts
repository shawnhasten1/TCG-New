// Photos of the real booster packs, several per set (collected from Bulbapedia by scripts/packArt.ts).
// The server picks one at random for each pack it deals; the pack keeps it, so collecting the different
// wrappers of a set is part of the collection. Shared by the app and the Worker.

import manifest from "./packArt.json";

export interface PackArt {
  /** Unique within its set. */
  id: string;
  /** What's on it, e.g. "Gyarados". */
  name: string;
  /** Served from public/. */
  src: string;
  /** Width / height. */
  aspect: number;
  /** The Bulbapedia file it came from. */
  source: string;
}

export type PackArtManifest = Record<string, PackArt[]>;

const arts = manifest as PackArtManifest;

/** Every pack art a set has (none for most promo and older sets without photos). */
export const packArts = (setId: string): PackArt[] => arts[setId] ?? [];

/** One of a set's pack arts, if it has any. */
export const packArt = (setId: string, artId: string | null | undefined): PackArt | undefined => (artId ? packArts(setId).find((a) => a.id === artId) : undefined);

/** A random pack art id for a set, or null when it has none. */
export function pickPackArt(setId: string, rng: () => number = Math.random): string | null {
  const options = packArts(setId);
  return options.length ? options[Math.floor(rng() * options.length)].id : null;
}
