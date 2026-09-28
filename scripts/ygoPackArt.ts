// Collects a photo of each Yu-Gi-Oh! set's English booster wrapper. Saves each as a WebP in public/packs/ygo/ and lists
// them in src/ygo/packArt.json, in the same shape as Pokémon's pack photos (src/packs/art.ts).
//
// Sources, which compete: the one with the most designs of a set wins, else the biggest scan.
// - Yugipedia and the Yu-Gi-Oh! Wiki (Fandom), whose "<CODE>-BoosterEN.png" (or "-BoosterNA", for the first sets)
//   is often a far bigger scan: about 1000 px wide for 2002–2007 sets, where YGOPRODeck's are about 300. The Wiki
//   also names each design of a set with several ("BLMR-BoosterEN-ArmedNeos.png"), and each becomes its own wrapper,
//   so collecting them is part of the collection, as in Pokémon. Edition suffixes (-UE, -1E, -LiteEdition) are the
//   same design, and the largest scan of it wins.
// - Konami's product pages (yugioh-card.com/en/products/<code>/), for most sets from 2017 on: each pack on an
//   empty 550 px canvas (about 300 px of pack, trimmed here), and a shot of each design where there are several
//   ("BLCR_Foil_1_550.png"). Displays, fans and groups of packs are skipped.
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

/**
 * The set's English wrapper scans on the wikis ("CSOC-BoosterEN.png", "CSOC-Booster-EN-UE.png"): the largest portrait
 * scan of each design (null: the only one), and the wider shots that show several packs at once.
 */
function wikiScans(setId: string, files: WikiFile[]): { designs: Map<string | null, WikiFile>; groups: WikiFile[] } {
  const designs = new Map<string | null, WikiFile>();
  const groups: WikiFile[] = [];
  const re = new RegExp(`^${setId}-Booster-?(EN|NA)(?:-([A-Za-z0-9]+))?\\.(png|jpe?g)$`, "i");
  for (const f of files) {
    const m = re.exec(f.name);
    if (!m || OTHER.test(f.name)) continue;
    const design = m[2] && !EDITION.test(m[2]) ? words(m[2]) : null;
    if (f.height < f.width * 1.3) {
      if (design === null) groups.push(f);
      continue;
    }
    const best = designs.get(design);
    if (!best || f.width > best.width) designs.set(design, f);
  }
  return { designs, groups };
}

/**
 * Packs standing side by side in one shot, cut apart at the empty columns between them (transparent or white). Packs
 * that overlap, as in a fan, have no gap between them, so a fan gives nothing; so does anything that doesn't come out
 * as two or more packs of about the same, upright shape.
 */
async function splitGroup(bytes: Buffer): Promise<Buffer[]> {
  const trimmed = await sharp(bytes).trim({ threshold: 20 }).toBuffer();
  const { data, info } = await sharp(trimmed).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const empty = (x: number) => {
    let ink = 0;
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * channels;
      if (data[i + 3] > 20 && !(data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235)) ink++;
    }
    return ink < height * 0.03;
  };
  const runs: [number, number][] = [];
  let start = -1;
  for (let x = 0; x <= width; x++) {
    const gap = x === width || empty(x);
    if (!gap && start < 0) start = x;
    if (gap && start >= 0) {
      runs.push([start, x]);
      start = -1;
    }
  }
  const packs = runs.filter(([a, b]) => b - a > height * 0.3);
  const widths = packs.map(([a, b]) => b - a);
  if (packs.length < 2 || Math.max(...widths) > Math.min(...widths) * 1.25 || widths.some((w) => w > height * 0.75)) return [];
  return Promise.all(packs.map(([a, b]) => sharp(trimmed).extract({ left: a, top: 0, width: b - a, height }).toBuffer()));
}

/** Shots of several packs that can't be split at gaps (a fan): the front pack, as fractions of the trimmed shot. */
const FRONT: Record<string, { file: string; box: [number, number, number, number] }> = {
  KICO: { file: "KICO-BoosterEN.png", box: [0.337, 0, 0.662, 1] },
};

/** A file, from the cache or fetched (politely, or with `get` for sites with their own pacing). */
async function download(url: string, file: string, headers?: Record<string, string>, get?: () => Promise<Response>): Promise<Buffer | undefined> {
  const hit = await readFile(file).catch(() => undefined);
  if (hit) return hit;
  const res = get ? await get() : headers ? await fetch(url, { headers }) : await politeFetch(url);
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

/* ---------- Konami's product pages ---------- */

const KONAMI = "https://www.yugioh-card.com";
/** Sets whose product page isn't at their code. */
const KONAMI_SLUGS: Record<string, string> = { MAZE: "mame", RA03: "qcb", RA04: "qcs", SP18: "star_vrains", LED2: "ld_ancient_millennium", LED3: "ld_white_dragon" };
/** Pages for a later reprint (the 25th Anniversary Editions), not the set's own pack. */
const KONAMI_REPRINTS = new Set(["LOB", "MRD", "SRL", "PSV", "IOC"]);
/** Product shots that aren't packs: boxes and tuck boxes. (Groups of packs are cut apart, splitGroup.) */
const KONAMI_NOT_ONE = /display|tbx|tuck/i;
const BROWSER = { "User-Agent": "Mozilla/5.0 (tcg-pack-opener; personal project)" };

let lastKonami = 0;
async function konamiGet(url: string, referer?: string): Promise<Response> {
  const gap = lastKonami + 500 - Date.now();
  if (gap > 0) await new Promise((r) => setTimeout(r, gap));
  lastKonami = Date.now();
  return fetch(url, { headers: referer ? { ...BROWSER, Referer: referer } : BROWSER });
}

/** The pack shots on a set's product page (full-size uploads, not WordPress's thumbnails), downloaded. */
async function konamiImages(setId: string): Promise<{ file: string; bytes: Buffer; page: string }[]> {
  if (KONAMI_REPRINTS.has(setId)) return [];
  const page = `${KONAMI}/en/products/${KONAMI_SLUGS[setId] ?? setId.toLowerCase()}/`;
  const cached = join(CACHE, `konami-${setId}.html`);
  let html = await readFile(cached, "utf8").catch(() => undefined);
  if (html === undefined) {
    const res = await konamiGet(page);
    html = res.ok ? await res.text() : "";
    await writeFile(cached, html);
  }
  const uploads = [...new Set([...html.matchAll(/\/en\/wp-content\/uploads\/[^"' )]+\.(?:png|jpe?g|webp)/gi)].map((m) => m[0]))];
  const shots = uploads.filter((u) => {
    const name = u.slice(u.lastIndexOf("/") + 1);
    return /550|foil|pack|booster/i.test(name) && !KONAMI_NOT_ONE.test(name) && (!/-\d+x\d+(-\d)?\.\w+$/.test(name) || /550x5[05]0/.test(name));
  });
  const out = [];
  for (const u of shots) {
    const file = u.slice(u.lastIndexOf("/") + 1);
    const bytes = await download(KONAMI + u, join(CACHE, `konami-${file}`), undefined, () => konamiGet(KONAMI + u, page));
    if (bytes) out.push({ file, bytes, page });
  }
  return out;
}

/** A Konami shot's design number ("BLCR_Foil_1_550", "BLGG_Foil01_550", "BLMM-foil2_550"), or null for the only one. */
const konamiDesign = (file: string) => /foil[_-]?0?([1-9])(?![0-9x])/i.exec(file)?.[1] ?? null;

/* ---------- Picking the best ---------- */

interface Candidate {
  source: "wiki" | "Konami" | "YGOPRODeck";
  /** Width of the pack itself, with any border trimmed. */
  width: number;
  bytes: () => Promise<Buffer>;
  /** Where it's from, for the credit. */
  page: string;
  name?: string;
}

/** The pack's own width, with the border or empty canvas around it trimmed, and whether it's a single upright pack. */
async function measure(bytes: Buffer): Promise<{ width: number; upright: boolean }> {
  const { info } = await sharp(bytes).trim({ threshold: 20 }).toBuffer({ resolveWithObject: true });
  return { width: info.width, upright: info.height > info.width * 1.3 };
}

await mkdir(CACHE, { recursive: true });
await mkdir(OUT_DIR, { recursive: true });
const manifest: PackArtManifest = {};
const tally: Record<string, number> = { wiki: 0, Konami: 0, YGOPRODeck: 0, none: 0 };

for (const set of YGO_SETS) {
  // The wikis: a design per named file, or the one wrapper.
  const { designs: wiki, groups } = wikiScans(set.id, await wikiFiles(set.id));
  const fromWiki = (f: WikiFile, name?: string): Candidate => ({
    source: "wiki",
    width: f.width,
    page: f.page,
    name,
    bytes: async () => (await download(f.url, join(CACHE, `wiki-${f.name}`), UA)) ?? Promise.reject(new Error(`Couldn't download ${f.url}`)),
  });
  const wikiNamed = [...wiki].filter((d): d is [string, WikiFile] => d[0] !== null).sort((a, b) => a[0].localeCompare(b[0])).map(([name, f]) => fromWiki(f, name));
  // Shots of several packs: each pack cut out, or just the front one of a fan.
  const cut = async (pieces: Buffer[], source: Candidate["source"], page: string) => Promise.all(pieces.map(async (b): Promise<Candidate> => ({ source, width: (await measure(b)).width, page, bytes: async () => b })));
  let wikiGroup: Candidate[] = [];
  const wikiFront: Candidate[] = [];
  for (const g of groups.sort((a, b) => b.width - a.width)) {
    const bytes = await fromWiki(g).bytes();
    const front = FRONT[set.id];
    if (front?.file === g.name) {
      const t = await sharp(bytes).trim({ threshold: 20 }).toBuffer({ resolveWithObject: true });
      const [x0, y0, x1, y1] = front.box;
      const box = { left: Math.round(x0 * t.info.width), top: Math.round(y0 * t.info.height), width: Math.round((x1 - x0) * t.info.width), height: Math.round((y1 - y0) * t.info.height) };
      wikiFront.push(...(await cut([await sharp(t.data).extract(box).toBuffer()], "wiki", g.page)));
    }
    const pieces = await splitGroup(bytes);
    if (pieces.length > wikiGroup.length) wikiGroup = await cut(pieces, "wiki", g.page);
  }

  // Konami: numbered designs, or the one wrapper.
  const konamiNumbered: [string, Candidate][] = [];
  const konamiSingles: Candidate[] = [];
  let konamiGroup: Candidate[] = [];
  for (const shot of await konamiImages(set.id)) {
    const { width, upright } = await measure(shot.bytes);
    if (!upright) {
      const pieces = await splitGroup(shot.bytes);
      if (pieces.length > konamiGroup.length) konamiGroup = await cut(pieces, "Konami", shot.page);
      continue;
    }
    const c: Candidate = { source: "Konami", width, page: shot.page, bytes: async () => shot.bytes };
    const n = konamiDesign(shot.file);
    if (n) konamiNumbered.push([n, c]);
    else konamiSingles.push(c);
  }
  const konamiDesigns = konamiNumbered.sort((a, b) => Number(a[0]) - Number(b[0])).map(([, c]) => c);

  // YGOPRODeck: its photo, cut apart where it shows several designs.
  const photo = NOT_PACKS.has(set.id) ? undefined : await download(`https://images.ygoprodeck.com/images/sets/${set.id}.jpg`, join(CACHE, `${set.id}.jpg`));
  const photoPage = `https://images.ygoprodeck.com/images/sets/${set.id}.jpg`;
  const splitDesigns: Candidate[] = [];
  if (photo && SPLIT[set.id]) {
    const split = SPLIT[set.id];
    const { width = 0, height = 0 } = await sharp(photo).metadata();
    const cw = Math.floor(width / split.cols);
    const cells = split.cells ?? Array.from({ length: split.cols }, (_, i) => ({ left: i * cw, top: 0, width: cw, height }));
    for (const cell of cells) {
      const bytes = await sharp(photo).extract(cell).toBuffer();
      splitDesigns.push({ source: "YGOPRODeck", width: (await measure(bytes)).width, page: photoPage, bytes: async () => bytes });
    }
  }

  // Several designs: whichever source has the most, the wikis first (they name them), then Konami (a scan each).
  const options = [wikiNamed, konamiDesigns, wikiGroup, konamiGroup, splitDesigns].filter((o) => o.length >= 2);
  let chosen = options.sort((a, b) => b.length - a.length)[0];
  if (!chosen) {
    // One design: the biggest scan of it.
    const singles = [...(wiki.get(null) ? [fromWiki(wiki.get(null)!)] : []), ...wikiFront, ...konamiSingles];
    if (photo) singles.push({ source: "YGOPRODeck", width: (await measure(photo)).width, page: photoPage, bytes: async () => photo });
    // Compare packs, not canvases: some wiki scans have wide empty margins.
    for (const c of singles) if (c.source === "wiki") c.width = (await measure(await c.bytes())).width;
    const best = singles.sort((a, b) => b.width - a.width)[0];
    chosen = best ? [best] : [];
  }

  const arts: PackArt[] = [];
  for (const [i, c] of chosen.entries()) {
    const id = String(i + 1);
    const aspect = await save(await c.bytes(), join(OUT_DIR, `${set.id}-${id}.webp`));
    const name = chosen.length === 1 ? set.name : (c.name ?? `${set.name}, design ${id}`);
    arts.push({ id, name, src: `/packs/ygo/${set.id}-${id}.webp`, aspect, source: c.page });
  }
  tally[chosen[0]?.source ?? "none"]++;
  if (arts.length) manifest[set.id] = arts;
  console.log(`${set.id.padEnd(5)} ${chosen.map((c) => `${c.source} ${c.width}`).join(" | ") || "none"}`);
}

await writeFile(MANIFEST, JSON.stringify(manifest, null, 1) + "\n");
console.log(`\n${Object.keys(manifest).length} of ${YGO_SETS.length} sets have wrappers: ${tally.wiki} from the wikis, ${tally.Konami} from Konami, ${tally.YGOPRODeck} from YGOPRODeck, ${tally.none} with none.`);
