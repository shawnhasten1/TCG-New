// Collects a photo of each Yu-Gi-Oh! set's English booster wrapper. Saves each as a WebP in public/packs/ygo/ and lists
// them in src/ygo/packArt.json, in the same shape as Pokémon's pack photos (src/packs/art.ts).
//
// Sources, best first:
// - Yugipedia and the Yu-Gi-Oh! Wiki (Fandom), whose "<CODE>-BoosterEN.png" (or "-BoosterNA", for the first sets)
//   is often a far bigger scan: about 1000 px wide for 2002–2007 sets, where YGOPRODeck's are about 300. The Wiki
//   also names each design of a set with several ("BLMR-BoosterEN-ArmedNeos.png"), and each becomes its own wrapper,
//   so collecting them is part of the collection, as in Pokémon. Edition suffixes (-UE, -1E, -LiteEdition) are the
//   same design, and the largest scan of it wins.
// - YGOPRODeck's set photo (images.ygoprodeck.com/images/sets/<CODE>.jpg), when the wikis have nothing bigger. A few
//   show several designs side by side (SPLIT); each is cut out as its own wrapper.
// Downloads and the wikis' file lists are cached in .cache/ygo-packs.
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
/** Saved width: the pack is drawn up to ~340 CSS px wide, so this is sharp on 2x screens. */
const WIDTH = 640;
const UA = { "User-Agent": "tcg-pack-opener/0.1 (personal project; pack art for a pack-opening game)" };

const WIKIS = [
  { name: "Yugipedia", api: "https://yugipedia.com/api.php" },
  { name: "the Yu-Gi-Oh! Wiki", api: "https://yugioh.fandom.com/api.php" },
];

/** YGOPRODeck photos that aren't of a pack: Duel Terminal's arcade posters, and boxes. */
const NOT_PACKS = new Set(["DT01", "DT02", "DT03", "DT04", "DT05", "DT06", "DT07", "MVP1", "HAC1"]);

type Cell = { left: number; top: number; width: number; height: number };
/** YGOPRODeck photos of several designs, in a row, or at `cells` (in pixels) where they aren't. */
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

/** Suffixes that mark another printing of the same wrapper, not another design. */
const EDITION = /^(UE|1E|LiteEdition|FirstEdition|UnlimitedEdition)$/;
/** Not the booster itself, or not the English one. */
const OTHER = /25t?h?Anniversary|Box|Display|Bonus/i;

interface WikiFile {
  wiki: string;
  name: string;
  width: number;
  height: number;
  url: string;
  page: string;
}

let lastWiki = 0;
async function wikiFiles(setId: string): Promise<WikiFile[]> {
  const file = join(CACHE, `wiki-${setId}.json`);
  const hit = await readFile(file, "utf8").then((s) => JSON.parse(s) as WikiFile[], () => undefined);
  if (hit) return hit;
  const out: WikiFile[] = [];
  for (const wiki of WIKIS) {
    const gap = lastWiki + 300 - Date.now();
    if (gap > 0) await new Promise((r) => setTimeout(r, gap));
    lastWiki = Date.now();
    const res = await fetch(`${wiki.api}?action=query&list=allimages&aiprefix=${setId}-Booster&aiprop=size|url&ailimit=100&format=json`, { headers: UA });
    if (!res.ok) throw new Error(`${res.status} from ${wiki.name} for ${setId}`);
    const json = (await res.json()) as { query?: { allimages?: { name: string; width: number; height: number; url: string; descriptionurl: string }[] } };
    for (const i of json.query?.allimages ?? []) out.push({ wiki: wiki.name, name: i.name, width: i.width, height: i.height, url: i.url, page: i.descriptionurl });
  }
  await writeFile(file, JSON.stringify(out));
  return out;
}

/** "ArmedNeos" → "Armed Neos", "DarkMagiciantheKnightofDragonMagic" → "Dark Magician the Knight of Dragon Magic". */
const words = (camel: string) => camel.replace(/([a-z])(the|of|and)(?=[A-Z])/g, "$1 $2 ").replace(/([a-z])([A-Z])/g, "$1 $2");

/** The set's English wrapper designs on the wikis: the largest portrait scan of each, by design (null: the only one). */
function wikiDesigns(setId: string, files: WikiFile[]): Map<string | null, WikiFile> {
  const designs = new Map<string | null, WikiFile>();
  const re = new RegExp(`^${setId}-Booster(EN|NA)(?:-([A-Za-z0-9]+))?\\.(png|jpe?g)$`, "i");
  for (const f of files) {
    const m = re.exec(f.name);
    if (!m || OTHER.test(f.name) || f.height < f.width * 1.3) continue;
    const design = m[2] && !EDITION.test(m[2]) ? words(m[2]) : null;
    const best = designs.get(design);
    if (!best || f.width > best.width) designs.set(design, f);
  }
  return designs;
}

async function download(url: string, file: string, headers?: Record<string, string>): Promise<Buffer | undefined> {
  const hit = await readFile(file).catch(() => undefined);
  if (hit) return hit;
  const res = headers ? await fetch(url, { headers }) : await politeFetch(url);
  if (!res.ok) return undefined;
  const bytes = Buffer.from(await res.arrayBuffer());
  await writeFile(file, bytes);
  return bytes;
}

/** Trims the white or transparent edge around a pack and saves it at up to WIDTH; its shape (width / height). */
async function save(bytes: Buffer, out: string): Promise<number> {
  const trimmed = await sharp(bytes).trim({ threshold: 20 }).toBuffer({ resolveWithObject: true });
  const webp = await sharp(trimmed.data).resize({ width: Math.min(WIDTH, trimmed.info.width) }).webp({ quality: 75, effort: 6 }).toBuffer({ resolveWithObject: true });
  await writeFile(out, webp.data);
  return Math.round((webp.info.width / webp.info.height) * 1000) / 1000;
}

await mkdir(CACHE, { recursive: true });
await mkdir(OUT_DIR, { recursive: true });
const manifest: PackArtManifest = {};
const tally = { wiki: 0, ygoprodeck: 0, none: 0 };

for (const set of YGO_SETS) {
  const designs = wikiDesigns(set.id, await wikiFiles(set.id));
  const named = [...designs].filter((d): d is [string, WikiFile] => d[0] !== null).sort((a, b) => a[0].localeCompare(b[0]));
  const photo = NOT_PACKS.has(set.id) ? undefined : await download(`https://images.ygoprodeck.com/images/sets/${set.id}.jpg`, join(CACHE, `${set.id}.jpg`));
  const photoWidth = photo ? ((await sharp(photo).metadata()).width ?? 0) : 0;
  const split = photo && SPLIT[set.id];
  const arts: PackArt[] = [];

  const fromWiki = async (f: WikiFile, id: string, name: string) => {
    const bytes = await download(f.url, join(CACHE, `wiki-${f.name}`), UA);
    if (!bytes) throw new Error(`Couldn't download ${f.url}`);
    const aspect = await save(bytes, join(OUT_DIR, `${set.id}-${id}.webp`));
    arts.push({ id, name, src: `/packs/ygo/${set.id}-${id}.webp`, aspect, source: f.page });
  };

  if (named.length >= 2 && (!split || named.length >= (split.cells?.length ?? split.cols))) {
    // Every design has its own scan on the wikis.
    for (const [i, [design, f]] of named.entries()) await fromWiki(f, String(i + 1), design);
    tally.wiki++;
  } else if (split) {
    // Several designs in one YGOPRODeck photo: cut them apart.
    const { width = 0, height = 0 } = await sharp(photo).metadata();
    const cw = Math.floor(width / split.cols);
    const cells = split.cells ?? Array.from({ length: split.cols }, (_, i) => ({ left: i * cw, top: 0, width: cw, height }));
    for (const [i, cell] of cells.entries()) {
      const id = String(i + 1);
      const aspect = await save(await sharp(photo).extract(cell).toBuffer(), join(OUT_DIR, `${set.id}-${id}.webp`));
      arts.push({ id, name: `${set.name}, design ${id}`, src: `/packs/ygo/${set.id}-${id}.webp`, aspect, source: `https://images.ygoprodeck.com/images/sets/${set.id}.jpg` });
    }
    tally.ygoprodeck++;
  } else {
    // One design: the biggest scan of it.
    const wiki = designs.get(null) ?? named[0]?.[1];
    if (wiki && wiki.width >= photoWidth) {
      await fromWiki(wiki, "1", set.name);
      tally.wiki++;
    } else if (photo) {
      const aspect = await save(photo, join(OUT_DIR, `${set.id}-1.webp`));
      arts.push({ id: "1", name: set.name, src: `/packs/ygo/${set.id}-1.webp`, aspect, source: `https://images.ygoprodeck.com/images/sets/${set.id}.jpg` });
      tally.ygoprodeck++;
    } else tally.none++;
  }
  if (arts.length) manifest[set.id] = arts;
  console.log(`${set.id.padEnd(5)} ${arts.map((a) => `${a.source.includes("ygoprodeck") ? "YGOPRODeck" : "wiki"} ${a.name === set.name ? "" : a.name}`).join(" | ") || "none"}`);
}

await writeFile(MANIFEST, JSON.stringify(manifest, null, 1) + "\n");
console.log(`\n${Object.keys(manifest).length} of ${YGO_SETS.length} sets have wrappers: ${tally.wiki} from the wikis, ${tally.ygoprodeck} from YGOPRODeck, ${tally.none} with none.`);
