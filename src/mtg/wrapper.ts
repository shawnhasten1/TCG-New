// Drawn Magic pack wrappers, as SVG. Magic has no pack photos yet, so each pack design (packArt.ts) is drawn around
// one of its set's cards' art, in the look of its booster era:
// - classic (1993–2008): a dark wrapper with the art in a gold frame, as boosters were then.
// - draft (2008–2023): the art full bleed, darkened top and bottom for the set's name and symbol.
// - play (2024–): the art over a bold band in the set's own colour, with the set symbol in a disc on its edge.
// The edges are crimped, with the teeth cut out, so the wrapper sits in the opener like a photo of a real pack (whose
// transparency also masks the foil shine). The Worker fills in the art and the set symbol (worker/mtg.ts), inlined as
// data URIs, since an SVG shown as an image can't load anything itself. Text uses fonts every device has, for the same
// reason. No game logo: just the game's name in plain type, below where the opener's tear line runs (about 13% down).

import type { MtgEra } from "./sets";

export interface WrapperInput {
  era: MtgEra;
  setId: string;
  setName: string;
  cardName: string;
  /** Data URIs: the card's art (Scryfall's art_crop) and the set symbol (Scryfall's black SVG). */
  art: string;
  symbol: string;
}

const W = 560;
const H = 1000;
/** Crimp teeth: how many across, and how deep. */
const TEETH = 28;
const DEPTH = 12;
/** The crimped bands at the top and bottom. */
const BAND = 60;

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Segoe UI', Helvetica, Arial, sans-serif";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

/** A stable hue (0–359) for a set, so its Play Booster band always has the same colour. */
export function setHue(setId: string): number {
  let h = 0;
  for (const c of setId) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/** Type small enough for a long name to fit the width. */
const fit = (text: string, max: number, perChar: number) => Math.min(max, Math.floor((W - 80) / (text.length * perChar)));

/** The wrapper's outline: straight sides, and teeth along the top and bottom. */
function outline(): string {
  const step = W / TEETH;
  const top = Array.from({ length: TEETH }, (_, i) => `L${i * step + step / 2},0 L${(i + 1) * step},${DEPTH}`).join(" ");
  const bottom = Array.from({ length: TEETH }, (_, i) => `L${W - i * step - step / 2},${H} L${W - (i + 1) * step},${H - DEPTH}`).join(" ");
  return `M0,${DEPTH} ${top} L${W},${H - DEPTH} ${bottom} Z`;
}

/** Heat-sealed ridges across the crimped bands. */
function crimps(): string {
  const ridges = (y: number) =>
    Array.from({ length: Math.floor(W / 7) }, (_, i) => `<rect x="${i * 7}" y="${y}" width="3" height="${BAND}" fill="#fff" opacity=".08"/>`).join("");
  return `<rect x="0" y="0" width="${W}" height="${BAND}" fill="#000" opacity=".28"/>${ridges(0)}<rect x="0" y="${H - BAND}" width="${W}" height="${BAND}" fill="#000" opacity=".28"/>${ridges(H - BAND)}`;
}

/** The set symbol, recoloured: Scryfall's are black. */
const symbolFilter = (id: string, [r, g, b]: [number, number, number]) =>
  `<filter id="${id}"><feColorMatrix type="matrix" values="0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 1 0"/></filter>`;

const gameName = (y: number, fill: string, font = SERIF) =>
  `<text x="${W / 2}" y="${y}" text-anchor="middle" font-family="${font}" font-weight="700" font-size="22" letter-spacing="5" fill="${fill}">MAGIC: THE GATHERING</text>`;

function classic({ setName, cardName, art, symbol }: WrapperInput): string {
  const size = fit(setName, 48, 0.6);
  return `
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#231a2b"/><stop offset=".55" stop-color="#140f18"/><stop offset="1" stop-color="#2b1d10"/></linearGradient>
      ${symbolFilter("gold", [0.85, 0.7, 0.36])}
      <clipPath id="window"><rect x="64" y="222" width="432" height="300" rx="6"/></clipPath>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect x="26" y="${BAND + 12}" width="${W - 52}" height="${H - 2 * BAND - 24}" rx="14" fill="none" stroke="#c9a24a" stroke-width="3"/>
    <rect x="36" y="${BAND + 22}" width="${W - 72}" height="${H - 2 * BAND - 44}" rx="10" fill="none" stroke="#c9a24a" stroke-width="1" opacity=".6"/>
    ${gameName(196, "#d9b865")}
    <image href="${art}" x="64" y="222" width="432" height="300" preserveAspectRatio="xMidYMid slice" clip-path="url(#window)"/>
    <rect x="64" y="222" width="432" height="300" rx="6" fill="none" stroke="#c9a24a" stroke-width="6"/>
    <text x="${W / 2}" y="600" text-anchor="middle" font-family="${SERIF}" font-style="italic" font-weight="700" font-size="${size}" fill="#f3e3b5">${esc(setName)}</text>
    <image href="${symbol}" x="${W / 2 - 50}" y="636" width="100" height="100" filter="url(#gold)"/>
    <text x="${W / 2}" y="792" text-anchor="middle" font-family="${SERIF}" font-style="italic" font-size="20" fill="#c8b27a">featuring ${esc(cardName)}</text>
    <text x="${W / 2}" y="866" text-anchor="middle" font-family="${SERIF}" font-weight="700" font-size="22" letter-spacing="4" fill="#d9b865">15 CARD BOOSTER</text>`;
}

function draft({ setName, cardName, art, symbol }: WrapperInput): string {
  const size = fit(setName, 50, 0.64);
  return `
    <defs>
      <linearGradient id="top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".85"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
      <linearGradient id="bottom" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".45" stop-color="#000" stop-opacity=".78"/><stop offset="1" stop-color="#000" stop-opacity=".94"/></linearGradient>
      ${symbolFilter("white", [1, 1, 1])}
    </defs>
    <rect width="${W}" height="${H}" fill="#111"/>
    <image href="${art}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>
    <rect width="${W}" height="320" fill="url(#top)"/>
    <rect y="500" width="${W}" height="500" fill="url(#bottom)"/>
    ${gameName(192, "#fff", SANS)}
    <image href="${symbol}" x="${W / 2 - 46}" y="600" width="92" height="92" filter="url(#white)"/>
    <text x="${W / 2}" y="770" text-anchor="middle" font-family="${SERIF}" font-weight="700" font-size="${size}" fill="#fff">${esc(setName)}</text>
    <text x="${W / 2}" y="808" text-anchor="middle" font-family="${SERIF}" font-style="italic" font-size="19" fill="#ddd">${esc(cardName)}</text>
    <rect x="${W / 2 - 118}" y="836" width="236" height="44" rx="22" fill="#b8892d"/>
    <text x="${W / 2}" y="866" text-anchor="middle" font-family="${SANS}" font-weight="800" font-size="20" letter-spacing="3" fill="#1c1406">DRAFT BOOSTER</text>`;
}

function play({ setId, setName, cardName, art, symbol }: WrapperInput): string {
  const hue = setHue(setId);
  const size = fit(setName, 36, 0.66);
  return `
    <defs>
      <linearGradient id="top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".75"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
      <linearGradient id="band" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 62% 38%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360} 58% 24%)"/></linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="#111"/>
    <image href="${art}" x="0" y="0" width="${W}" height="720" preserveAspectRatio="xMidYMid slice"/>
    <rect width="${W}" height="300" fill="url(#top)"/>
    ${gameName(192, "#fff", SANS)}
    <polygon points="0,700 ${W},620 ${W},${H} 0,${H}" fill="url(#band)"/>
    <polygon points="0,700 ${W},620 ${W},628 0,708" fill="#fff" opacity=".85"/>
    <circle cx="${W - 92}" cy="652" r="54" fill="#fff"/>
    <image href="${symbol}" x="${W - 124}" y="620" width="64" height="64"/>
    <text x="40" y="770" font-family="${SERIF}" font-weight="700" font-size="${size}" fill="#fff">${esc(setName)}</text>
    <text x="40" y="838" font-family="${SANS}" font-weight="900" font-size="50" letter-spacing="1" fill="#fff">PLAY BOOSTER</text>
    <text x="40" y="878" font-family="${SERIF}" font-style="italic" font-size="19" fill="#fff" opacity=".85">featuring ${esc(cardName)}</text>`;
}

const ERAS = { classic, draft, play };

/** A wrapper, as an SVG document. */
export function renderWrapper(input: WrapperInput): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <clipPath id="edge"><path d="${outline()}"/></clipPath>
  <g clip-path="url(#edge)">${ERAS[input.era](input)}${crimps()}</g>
</svg>`;
}
