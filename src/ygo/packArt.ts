// Photos of Yu-Gi-Oh! booster wrappers (src/ygo/packArt.json, saved in public/packs/ygo by scripts/ygoPackArt.ts), in
// the same shape as Pokémon's pack photos (packs/art.ts) so the opener, the Packs view and the shop show them alike.
// Most sets have one design; a few have several, and the server picks one at random for each pack, which keeps it.
// Shared by the app and the Worker.

import type { PackArt, PackArtManifest } from "../packs/art";
import manifest from "./packArt.json";

const arts = manifest as PackArtManifest;

/** Every design a set's packs come in (none for the few sets without a photo). */
export const ygoPackArts = (setId: string): PackArt[] => arts[setId] ?? [];

/** Sets with designs. */
export const ygoPackArtSets = () => Object.keys(arts);

/** A random design for a pack from a set, or null when it has none. */
export function ygoPickPackArt(setId: string, rng: () => number = Math.random): string | null {
  const options = ygoPackArts(setId);
  return options.length ? options[Math.floor(rng() * options.length)].id : null;
}
