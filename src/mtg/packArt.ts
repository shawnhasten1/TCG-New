// The designs Magic packs come in (src/mtg/packArt.json, from scripts/mtgPackArt.ts), in the same shape as Pokémon's pack
// photos (packs/art.ts) so the opener, the Packs view and the shop show them alike. Each is a wrapper drawn around one of
// the set's cards' art (src/mtg/wrapper.ts, served by worker/mtg.ts). The server picks one at random for each pack, and
// the pack keeps it. Shared by the app and the Worker.
//
// A real pack photo can stand in for a drawn design later: give the entry a `src` of its own.

import type { PackArt } from "../packs/art";
import manifest from "./packArt.json";

export interface MtgArt {
  /** The card's collector number, which is the design's id within its set. */
  id: string;
  /** The card, which names the design (front face only, for double-faced cards). */
  name: string;
  scryfallId: string;
  artist: string;
  /** A photo of the real pack, served from public/, instead of the drawn wrapper. */
  src?: string;
}

const arts = manifest as Record<string, MtgArt[]>;

/** Bump when the drawing changes, so browsers and Cloudflare fetch the new one. */
export const WRAPPER_VERSION = 1;

/** Drawn wrappers are this shape, a booster's (width / height). */
export const WRAPPER_ASPECT = 0.56;

export const mtgArt = (setId: string, artId: string): MtgArt | undefined => arts[setId]?.find((a) => a.id === artId);

/** Every design a set's packs come in. */
export const mtgPackArts = (setId: string): PackArt[] =>
  (arts[setId] ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    src: a.src ?? `/api/mtg/pack/v${WRAPPER_VERSION}/${setId}/${encodeURIComponent(a.id)}.svg`,
    aspect: WRAPPER_ASPECT,
    source: `Art by ${a.artist}, from Scryfall`,
  }));

/** Sets with designs. */
export const mtgPackArtSets = () => Object.keys(arts);

/** A random design for a pack from a set, or null when it has none. */
export function mtgPickPackArt(setId: string, rng: () => number = Math.random): string | null {
  const options = arts[setId] ?? [];
  return options.length ? options[Math.floor(rng() * options.length)].id : null;
}
