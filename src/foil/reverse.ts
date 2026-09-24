// Reverse holo patterns by era, after the physical cards (Bulbapedia's Holofoil page):
//   swsh  Sword & Shield: columns of chevron tiles, each with the type symbol (Poké Balls on Trainers).
//   sv    Scarlet & Violet: "cobblestone" tiles with type symbols of different sizes.
//   xy    XY: small type symbols repeated across the background.
//   sm    Sun & Moon: one large type symbol on the left side.
//   fireworks  Legendary Collection: dense sparkle bursts.
//   plain e-Card, EX, DP–BW, Mega Evolution: a plain holographic background.
// Textures are grey on black (black = no foil) and generated on first use, one per pattern and symbol.

export type ReversePattern = "plain" | "fireworks" | "xy" | "sm" | "swsh" | "sv";
export type TypeSymbol = "grass" | "fire" | "water" | "lightning" | "psychic" | "fighting" | "darkness" | "metal" | "dragon" | "fairy" | "colorless" | "ball";

const TYPES = new Set<TypeSymbol>(["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "metal", "dragon", "fairy", "colorless"]);

/** The symbol a card's reverse foil shows: its first type, or a Poké Ball for Trainers and Energy. */
export function typeSymbol(category?: string | null, types?: string[] | null): TypeSymbol {
  const t = types?.[0]?.toLowerCase() as TypeSymbol | undefined;
  if (category === "Pokemon" && t && TYPES.has(t)) return t;
  return category === "Pokemon" ? "colorless" : "ball";
}

/* ---------- Symbols: white shapes in a 2×2 box centred on 0,0, with cut-outs punched through ---------- */

type Draw = (g: CanvasRenderingContext2D) => void;
const poly = (g: CanvasRenderingContext2D, pts: number[]) => {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
};
const circle = (g: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
};
/** Runs `d` as a cut-out: whatever it fills or strokes is erased. */
const cut = (g: CanvasRenderingContext2D, d: () => void) => {
  g.save();
  g.globalCompositeOperation = "destination-out";
  d();
  g.restore();
};
const star = (g: CanvasRenderingContext2D, points: number, outer: number, inner: number) => {
  const pts: number[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer, a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    pts.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  poly(g, pts);
};

const SYMBOLS: Record<TypeSymbol, Draw> = {
  lightning: (g) => {
    poly(g, [0.3, -1, -0.55, 0.15, -0.02, 0.15, -0.3, 1, 0.55, -0.2, 0.02, -0.2, 0.35, -1]);
    g.fill();
  },
  fire: (g) => {
    g.beginPath();
    g.moveTo(0, -1);
    g.bezierCurveTo(0.3, -0.5, 0.8, -0.2, 0.72, 0.35);
    g.bezierCurveTo(0.65, 0.8, 0.3, 1, 0, 1);
    g.bezierCurveTo(-0.3, 1, -0.72, 0.8, -0.72, 0.35);
    g.bezierCurveTo(-0.72, 0, -0.45, -0.2, -0.35, -0.5);
    g.bezierCurveTo(-0.2, -0.15, -0.05, -0.05, 0.02, -0.15);
    g.bezierCurveTo(0.12, -0.45, -0.05, -0.7, 0, -1);
    g.fill();
    cut(g, () => {
      g.beginPath();
      g.moveTo(0, 0.1);
      g.bezierCurveTo(0.35, 0.35, 0.35, 0.8, 0, 0.8);
      g.bezierCurveTo(-0.35, 0.8, -0.35, 0.4, 0, 0.1);
      g.fill();
    });
  },
  water: (g) => {
    g.beginPath();
    g.moveTo(0, -1);
    g.bezierCurveTo(0.35, -0.45, 0.75, 0, 0.75, 0.35);
    g.bezierCurveTo(0.75, 0.78, 0.4, 1, 0, 1);
    g.bezierCurveTo(-0.4, 1, -0.75, 0.78, -0.75, 0.35);
    g.bezierCurveTo(-0.75, 0, -0.35, -0.45, 0, -1);
    g.fill();
    cut(g, () => {
      g.lineWidth = 0.14;
      g.beginPath();
      g.arc(0, 0.3, 0.45, Math.PI * 0.55, Math.PI * 0.95);
      g.stroke();
    });
  },
  grass: (g) => {
    g.beginPath();
    g.moveTo(-0.8, 0.85);
    g.bezierCurveTo(-0.85, -0.2, -0.1, -0.9, 0.9, -0.9);
    g.bezierCurveTo(0.9, 0.1, 0.2, 0.85, -0.8, 0.85);
    g.fill();
    cut(g, () => {
      g.lineWidth = 0.14;
      g.beginPath();
      g.moveTo(-0.75, 0.8);
      g.quadraticCurveTo(0.05, 0.05, 0.6, -0.6);
      g.stroke();
    });
  },
  psychic: (g) => {
    g.beginPath();
    g.moveTo(-1, 0);
    g.quadraticCurveTo(0, -0.85, 1, 0);
    g.quadraticCurveTo(0, 0.85, -1, 0);
    g.fill();
    cut(g, () => {
      circle(g, 0, 0, 0.36);
      g.fill();
    });
    circle(g, 0, 0, 0.16);
    g.fill();
  },
  fighting: (g) => {
    g.beginPath();
    g.roundRect(-0.72, -0.62, 1.44, 1.4, 0.3);
    g.fill();
    cut(g, () => {
      g.lineWidth = 0.13;
      for (const x of [-0.24, 0.12]) {
        g.beginPath();
        g.moveTo(x + 0.06, -0.62);
        g.lineTo(x + 0.06, -0.05);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(-0.72, -0.05);
      g.lineTo(0.35, -0.05);
      g.quadraticCurveTo(0.5, 0.2, 0.3, 0.4);
      g.stroke();
    });
  },
  darkness: (g) => {
    circle(g, 0, 0, 0.92);
    g.fill();
    cut(g, () => {
      circle(g, 0.38, -0.3, 0.75);
      g.fill();
    });
  },
  metal: (g) => {
    const hex: number[] = [];
    for (let i = 0; i < 6; i++) hex.push(Math.cos((i / 6) * Math.PI * 2) * 0.95, Math.sin((i / 6) * Math.PI * 2) * 0.95);
    poly(g, hex);
    g.fill();
    cut(g, () => {
      poly(g, [0, -0.5, 0.45, 0.32, -0.45, 0.32]);
      g.fill();
    });
  },
  dragon: (g) => {
    // Two curved blades turning around the centre.
    for (const s of [1, -1]) {
      g.beginPath();
      g.moveTo(0, 0);
      g.bezierCurveTo(0.2 * s, -0.9 * s, 0.9 * s, -0.8 * s, 0.95 * s, -0.1 * s);
      g.bezierCurveTo(0.6 * s, -0.45 * s, 0.25 * s, -0.35 * s, 0, 0);
      g.fill();
    }
    circle(g, 0, 0, 0.3);
    g.fill();
  },
  fairy: (g) => {
    star(g, 4, 1, 0.3);
    g.fill();
    cut(g, () => {
      circle(g, 0, 0, 0.14);
      g.fill();
    });
  },
  colorless: (g) => {
    star(g, 5, 1, 0.45);
    g.fill();
  },
  ball: (g) => {
    circle(g, 0, 0, 0.95);
    g.fill();
    cut(g, () => {
      g.fillRect(-1, -0.08, 2, 0.16);
      circle(g, 0, 0, 0.36);
      g.fill();
    });
    circle(g, 0, 0, 0.2);
    g.fill();
  },
};

const sprites = new Map<TypeSymbol, HTMLCanvasElement>();
/** The symbol as a 128px white sprite on transparent. */
function sprite(sym: TypeSymbol): HTMLCanvasElement {
  let c = sprites.get(sym);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.translate(64, 64);
  g.scale(56, 56);
  g.fillStyle = g.strokeStyle = "#fff";
  SYMBOLS[sym](g);
  sprites.set(sym, c);
  return c;
}

/** Stamps a symbol with a dark rim, the way the foil's embossed icons catch the light. */
function stamp(g: CanvasRenderingContext2D, sym: TypeSymbol, x: number, y: number, size: number, alpha = 1) {
  g.save();
  g.globalAlpha = alpha;
  g.shadowColor = "#000";
  g.shadowBlur = size * 0.12;
  g.drawImage(sprite(sym), x - size / 2, y - size / 2, size, size);
  g.restore();
}

/** Seeded random, so each pattern+symbol always draws the same way. */
function rng(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  // mulberry32
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const grey = (l: number) => `hsl(0 0% ${Math.round(l)}%)`;
/** Sizes the canvas and fills it black (no foil). */
function sheet(g: CanvasRenderingContext2D, w: number, h: number) {
  g.canvas.width = w;
  g.canvas.height = h;
  g.fillStyle = "#000";
  g.fillRect(0, 0, w, h);
}

/* ---------- Patterns ---------- */

function drawSwsh(g: CanvasRenderingContext2D, sym: TypeSymbol, rnd: () => number) {
  // 7 columns of upward chevrons; columns alternate half a tile up or down.
  const cols = 7, rows = 8, w = 40, h = 34, lift = h * 0.35;
  sheet(g, cols * w, rows * h);
  const shade = Array.from({ length: cols * rows }, () => 22 + rnd() * 60);
  for (let c = 0; c < cols; c++) {
    const x0 = c * w + 1, x1 = (c + 1) * w - 1, off = (c % 2) * (h / 2);
    for (let r = -1; r <= rows; r++) {
      const y = r * h + off;
      g.fillStyle = grey(shade[c * rows + ((r + rows) % rows)]);
      poly(g, [x0, y + lift, (x0 + x1) / 2, y, x1, y + lift, x1, y + h + lift, (x0 + x1) / 2, y + h, x0, y + h + lift]);
      g.fill();
      stamp(g, sym, (x0 + x1) / 2, y + h * 0.62, w * 0.5, 0.95);
    }
  }
}

function drawSv(g: CanvasRenderingContext2D, sym: TypeSymbol, rnd: () => number) {
  // Cobblestones: a Voronoi of jittered points on a wrapping grid, with dark mortar where two stones meet.
  // About half the stones carry the symbol, at sizes that follow the stone.
  const S = 240, n = 7, cell = S / n;
  sheet(g, S, S);
  const pts = Array.from({ length: n * n }, (_, i) => ({
    x: ((i % n) + 0.5 + (rnd() - 0.5) * 0.8) * cell,
    y: (Math.floor(i / n) + 0.5 + (rnd() - 0.5) * 0.8) * cell,
    l: 25 + rnd() * 55,
  }));
  const img = g.createImageData(S, S);
  const wrap = (d: number) => (d > S / 2 ? d - S : d < -S / 2 ? d + S : d);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let d1 = Infinity, d2 = Infinity, best = 0;
      for (let i = 0; i < pts.length; i++) {
        const dx = wrap(pts[i].x - x), dy = wrap(pts[i].y - y), d = dx * dx + dy * dy;
        if (d < d1) [d2, d1, best] = [d1, d, i];
        else if (d < d2) d2 = d;
      }
      // Mortar: near the bisector between the two closest points. Stones darken a little toward their edge.
      const edge = Math.sqrt(d2) - Math.sqrt(d1);
      const v = edge < 2.5 ? 0 : (pts[best].l * 2.55) * Math.min(1, 0.75 + edge / 40);
      const o = (y * S + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  for (const p of pts) {
    if (rnd() > 0.55) continue;
    const size = cell * (0.35 + rnd() * 0.45);
    for (const dx of [0, -S, S]) for (const dy of [0, -S, S]) stamp(g, sym, p.x + dx, p.y + dy, size, 0.9);
  }
}

function drawXy(g: CanvasRenderingContext2D, sym: TypeSymbol) {
  // A flat foil field with small symbols on a staggered grid.
  const S = 120;
  sheet(g, S, S);
  g.fillStyle = grey(45);
  g.fillRect(0, 0, S, S);
  for (const [x, y] of [[30, 30], [90, 90], [90, -30], [-30, 90], [150, 30], [30, 150], [90, 210]]) stamp(g, sym, x, y, 30, 0.9);
}

function drawSm(g: CanvasRenderingContext2D, sym: TypeSymbol) {
  // Card-shaped: plain foil with one large symbol breaking off the left edge.
  sheet(g, 300, 412);
  g.fillStyle = grey(28);
  g.fillRect(0, 0, 300, 412);
  stamp(g, sym, 40, 250, 300, 1);
}

const textures = new Map<string, string>();
/** CSS url() for a reverse pattern with a symbol, drawn on first use. Empty for the untextured patterns. */
export function reverseTexture(pattern: ReversePattern, sym: TypeSymbol): string {
  if (pattern === "plain" || pattern === "fireworks" || typeof document === "undefined") return "";
  const key = `${pattern}:${sym}`;
  let url = textures.get(key);
  if (url) return url;
  const c = document.createElement("canvas");
  const g = c.getContext("2d");
  if (!g) return "";
  const rnd = rng(key);
  if (pattern === "swsh") drawSwsh(g, sym, rnd);
  else if (pattern === "sv") drawSv(g, sym, rnd);
  else if (pattern === "xy") drawXy(g, sym);
  else drawSm(g, sym);
  url = `url(${c.toDataURL()})`;
  textures.set(key, url);
  return url;
}
