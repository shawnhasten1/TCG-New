// Collects the English booster pack art for every international set from Bulbapedia's set galleries.
// Saves each pack as a WebP in public/packs/<setId>/ and lists them in src/packs/packArt.json (TCGdex set id → arts).
// Bulbapedia pages and TCGdex are cached in .cache, so re-runs only download what's new.
//
// Usage: npm run pack-art                  fetch everything
//        npm run pack-art -- --dry-run     just show which sets match and which packs would be saved
//        npm run pack-art -- base5 swsh7   only these sets (merged into the existing list)

import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { createClient } from "../src/api/tcgdex";
import type { PackArt, PackArtManifest } from "../src/packs/art";
import { fileCache } from "./fileCache";

const API = "https://bulbapedia.bulbagarden.net/w/api.php";
const UA = "tcg-pack-opener/0.1 (personal project; pack art for a pack-opening game)";
const OUT_DIR = "public/packs";
const MANIFEST = "src/packs/packArt.json";
/** Saved width: the pack is at most ~340 CSS px wide, so this covers 2x screens. */
const WIDTH = 560;

/** Bulbapedia set pages whose TCGdex set can't be found by name. A page covering two sets splits its packs by caption. */
const SET_ID_OVERRIDES: Record<string, string[]> = {
  "HeartGold & SoulSilver (TCG)": ["hgss1"],
  "Black Bolt & White Flare (TCG)": ["sv10.5b", "sv10.5w"],
};

/** Captions starting with one of these are packs from outside the English release. */
const OTHER_LANGUAGES = /^(Japanese|Brazilian|European|Asian|Korean|Chinese|Traditional|Simplified|Thai|Indonesian|German|French|Italian|Spanish|Portuguese|Dutch|Russian|Polish|Latin)\b/i;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const only = new Set(args.filter((a) => !a.startsWith("--")));

const cache = fileCache(".cache/bulbapedia");
let lastRequest = 0;

/** Bulbapedia API call, politely spaced and cached. */
async function api<T>(params: Record<string, string>): Promise<T> {
  const url = `${API}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
  const key = createHash("sha1").update(url).digest("hex"); // URLs are too long for Windows file names
  const hit = await cache.get<T>(key);
  if (hit) return hit;
  await pause();
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  const body = (await res.json()) as T & { error?: { info: string } };
  if (body.error) throw new Error(`${body.error.info} (${url})`);
  await cache.set(key, body);
  return body;
}

async function pause() {
  const wait = lastRequest + 1000 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
}

const wikitext = async (page: string) =>
  (await api<{ parse: { title: string; wikitext: string } }>({ action: "parse", page, prop: "wikitext", redirects: "1" })).parse;

/** Set page titles listed under "International sets" on the main TCG page. */
async function setPages(): Promise<string[]> {
  const main = "Pokémon_Trading_Card_Game";
  const { parse } = await api<{ parse: { sections: { anchor: string; index: string }[] } }>({ action: "parse", page: main, prop: "sections" });
  const section = parse.sections.find((s) => s.anchor === "International_sets");
  if (!section) throw new Error("No International sets section");
  const { parse: text } = await api<{ parse: { wikitext: string } }>({ action: "parse", page: main, prop: "wikitext", section: section.index });
  // Stop before the unreleased sets and the promo lists.
  const pages = [...text.wikitext.matchAll(/^\*.*?\{\{TCG\|([^}|]+)\}\}/gm)].map((m) => `${m[1].trim()} (TCG)`);
  return [...new Set(pages)];
}

/** Tidies a gallery caption: no line breaks, links or templates. */
const cleanCaption = (c: string) =>
  c
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/''+/g, "")
    .replace(/\s+/g, " ")
    .trim();

interface GalleryPack {
  file: string;
  caption: string;
  name: string;
}

/** English booster packs in a set page's merchandise gallery. Newer pages drop the "English" ("Cinderace booster"). */
function englishPacks(text: string): GalleryPack[] {
  const packs: GalleryPack[] = [];
  for (const gallery of text.matchAll(/\{\{TCGMerchGallery([\s\S]*?)\n\}\}/g)) {
    const fields = new Map<string, string>();
    for (const m of gallery[1].matchAll(/^\|\s*(image|caption)(\d+)\s*=(.*)$/gm)) fields.set(`${m[1]}${m[2]}`, m[3].trim());
    for (const [key, file] of fields) {
      if (!key.startsWith("image")) continue;
      const caption = cleanCaption(fields.get(`caption${key.slice(5)}`) ?? "");
      if (OTHER_LANGUAGES.test(caption) || !/\b(packs?|boosters?)\b/i.test(caption)) continue;
      if (/\b(box|blister|tin|bundle|collection|display|case|code|ad|advert|promo)\b/i.test(caption)) continue;
      const name = caption
        .replace(/^English\s*/i, "")
        .replace(/\b(booster )?(packs?|boosters?)\b/i, "")
        .replace(/\s+/g, " ")
        .trim();
      packs.push({ file, caption, name: name ? name[0].toUpperCase() + name.slice(1) : "Standard" });
    }
  }
  // Flat artwork ("pack art", "illustration") only when there's no photo of the pack itself.
  const art = (p: GalleryPack) => /\b(art|artwork|illustration)\b/i.test(p.caption);
  return packs.some((p) => !art(p)) ? packs.filter((p) => !art(p)) : packs;
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const slug = (s: string) => normalize(s).replace(/ /g, "-") || "pack";

/** Downloads a gallery file at the saved width, trimmed and converted to WebP. */
async function download(file: string, out: string): Promise<number> {
  const title = `File:${file}`;
  const info = await api<{ query: { pages: { imageinfo?: { thumburl?: string; url: string; width: number }[] }[] } }>({
    action: "query",
    titles: title,
    prop: "imageinfo",
    iiprop: "url|size",
    iiurlwidth: String(WIDTH),
  });
  const image = info.query.pages[0]?.imageinfo?.[0];
  if (!image) throw new Error(`No image for ${title}`);
  const src = image.width > WIDTH && image.thumburl ? image.thumburl : image.url;
  await pause();
  const res = await fetch(src, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} for ${src}`);
  const input = Buffer.from(await res.arrayBuffer());
  // Trim the scan's plain border (white paper, or transparency on newer renders) so the pack fills its box.
  const trimmed = await sharp(input).trim({ threshold: 24 }).toBuffer().catch(() => input);
  const { data, info: meta } = await sharp(trimmed).resize({ width: WIDTH, withoutEnlargement: true }).webp({ quality: 75 }).toBuffer({ resolveWithObject: true });
  await writeFile(out, data);
  return meta.width / meta.height;
}

async function exists(path: string) {
  return stat(path).then(
    () => true,
    () => false,
  );
}

/* ---------- Run ---------- */

const tcgdex = createClient(fileCache());
const sets = await tcgdex.listSetSummaries();
const byName = new Map<string, string>();
for (const s of sets) byName.set(normalize(s.name), s.id);
const nameOf = new Map(sets.map((s) => [s.id, s.name]));
const findSets = (title: string): string[] => {
  if (SET_ID_OVERRIDES[title]) return SET_ID_OVERRIDES[title];
  const name = title.replace(/ \(TCG\)$/, "");
  const id = byName.get(normalize(name)) ?? byName.get(normalize(name.replace(/^EX /, "")));
  return id ? [id] : [];
};

const manifest: PackArtManifest = only.size || dryRun ? JSON.parse(await readFile(MANIFEST, "utf8").catch(() => "{}")) : {};
const unmatched: string[] = [];
const noPacks: string[] = [];
let saved = 0;

const work: { title: string; setId: string; packs: GalleryPack[] }[] = [];
for (const page of await setPages()) {
  const { title, wikitext: text } = await wikitext(page);
  const ids = findSets(title);
  if (!ids.length) unmatched.push(title);
  const packs = englishPacks(text);
  // A page covering two sets: each takes the packs its caption names.
  for (const setId of ids) work.push({ title, setId, packs: ids.length > 1 ? packs.filter((p) => normalize(p.caption).includes(normalize(nameOf.get(setId) ?? setId))) : packs });
}

const seen = new Set<string>();
for (const { title, setId, packs } of work) {
  if ((only.size && !only.has(setId)) || seen.has(setId)) continue;
  seen.add(setId);
  if (!packs.length) {
    noPacks.push(`${title} (${setId})`);
    continue;
  }
  console.log(`${setId.padEnd(10)} ${title}: ${packs.map((p) => p.name).join(" · ")}`);
  if (dryRun) continue;

  await mkdir(join(OUT_DIR, setId), { recursive: true });
  const arts: PackArt[] = [];
  const used = new Set<string>();
  for (const p of packs) {
    let id = slug(p.name);
    for (let n = 2; used.has(id); n++) id = `${slug(p.name)}-${n}`;
    used.add(id);
    const out = join(OUT_DIR, setId, `${id}.webp`);
    try {
      const aspect = await download(p.file, out);
      arts.push({ id, name: p.name, src: `/packs/${setId}/${id}.webp`, aspect: Math.round(aspect * 1000) / 1000, source: `File:${p.file}` });
      saved++;
    } catch (err) {
      console.warn(`  Couldn't save ${p.file}: ${err instanceof Error ? err.message : err}`);
      if (await exists(out)) console.warn("  (an older copy is still on disk)");
    }
  }
  if (arts.length) manifest[setId] = arts;
}

if (unmatched.length) console.log(`\nNo TCGdex set found for (add to SET_ID_OVERRIDES if they should have one):\n  ${unmatched.join("\n  ")}`);
if (noPacks.length) console.log(`\nNo English packs in the gallery:\n  ${noPacks.join("\n  ")}`);
if (!dryRun) {
  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(MANIFEST, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`\nSaved ${saved} packs for ${Object.keys(manifest).length} sets to ${OUT_DIR}; list in ${MANIFEST}.`);
}
