// Collects a photo of each Yu-Gi-Oh! set's booster wrapper from YGOPRODeck, which asks that images be re-hosted.
// Saves each as a WebP in public/packs/ygo/ and lists them in src/ygo/packArt.json, in the same shape as Pokémon's pack
// photos (src/packs/art.ts). Some photos show several designs side by side (SPLIT); each becomes its own wrapper, so
// collecting them is part of the collection, as in Pokémon. Downloads are cached in .cache/ygo-packs.
// Usage: npm run ygo-pack-art   (re-run after adding sets; check new photos are packs, not boxes or posters)
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import type { PackArt, PackArtManifest } from "../src/packs/art";
import { YGO_SETS } from "../src/ygo/sets";
import { politeFetch } from "./ygoprodeck";

const CACHE = ".cache/ygo-packs";
const OUT_DIR = "public/packs/ygo";
const MANIFEST = "src/ygo/packArt.json";
/** Saved width: the pack is at most ~340 CSS px wide, so this covers 2x screens. */
const WIDTH = 560;

/** Photos that aren't of a pack: Duel Terminal's arcade posters, and boxes. */
const NOT_PACKS = new Set(["DT01", "DT02", "DT03", "DT04", "DT05", "DT06", "DT07", "MVP1", "HAC1"]);

type Cell = { left: number; top: number; width: number; height: number };
/** Photos of several designs, in a row, or at `cells` (in pixels) where they aren't. */
const SPLIT: Record<string, { cols: number; cells?: Cell[] }> = {
  // Three on top, two centred below, in a 500×500 photo.
  BLMR: {
    cols: 3,
    cells: [
      { left: 0, top: 0, width: 166, height: 250 },
      { left: 166, top: 0, width: 167, height: 250 },
      { left: 333, top: 0, width: 167, height: 250 },
      { left: 60, top: 250, width: 190, height: 250 },
      { left: 250, top: 250, width: 190, height: 250 },
    ],
  },
  BLMM: { cols: 2 },
  BLGG: { cols: 2 },
  MZTM: { cols: 3 },
  MZMU: { cols: 3 },
};

await mkdir(CACHE, { recursive: true });
await mkdir(OUT_DIR, { recursive: true });
const manifest: PackArtManifest = {};

for (const set of YGO_SETS) {
  if (NOT_PACKS.has(set.id)) continue;
  const file = join(CACHE, `${set.id}.jpg`);
  let bytes: Buffer | undefined = await readFile(file).catch(() => undefined);
  if (!bytes) {
    const res = await politeFetch(`https://images.ygoprodeck.com/images/sets/${set.id}.jpg`);
    if (!res.ok) {
      console.log(`${set.id.padEnd(5)} none (${res.status})`);
      continue;
    }
    bytes = Buffer.from(await res.arrayBuffer());
    await writeFile(file, bytes);
  }

  const { width = 0, height = 0 } = await sharp(bytes).metadata();
  const split = SPLIT[set.id] ?? { cols: 1 };
  const cw = Math.floor(width / split.cols);
  const cells = split.cells ?? Array.from({ length: split.cols }, (_, i) => ({ left: i * cw, top: 0, width: cw, height }));
  const count = cells.length;
  const arts: PackArt[] = [];
  for (const [i, cell] of cells.entries()) {
    // Trim the white around each pack, then scale it to WIDTH.
    const cropped = await sharp(bytes).extract(cell).toBuffer();
    const trimmed = await sharp(cropped).trim({ threshold: 20 }).toBuffer({ resolveWithObject: true });
    const out = await sharp(trimmed.data).resize({ width: Math.min(WIDTH, trimmed.info.width) }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    const id = count === 1 ? "1" : String(i + 1);
    await writeFile(join(OUT_DIR, `${set.id}-${id}.webp`), out.data);
    arts.push({
      id,
      name: count === 1 ? set.name : `${set.name}, design ${id}`,
      src: `/packs/ygo/${set.id}-${id}.webp`,
      aspect: Math.round((out.info.width / out.info.height) * 1000) / 1000,
      source: `https://images.ygoprodeck.com/images/sets/${set.id}.jpg`,
    });
  }
  manifest[set.id] = arts;
  console.log(`${set.id.padEnd(5)} ${arts.map((a) => a.aspect).join(", ")}`);
}

await writeFile(MANIFEST, JSON.stringify(manifest, null, 1) + "\n");
console.log(`\n${Object.keys(manifest).length} of ${YGO_SETS.length} sets have wrappers.`);
