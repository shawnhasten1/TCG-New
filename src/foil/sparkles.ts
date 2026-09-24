// Foil textures, generated once and shared as CSS variables on :root:
//   --sparkles: sparse bright points, for the glitter layer.
//   --flecks:   dense glitter flakes, for Amazing, shiny and rainbow foils.
//   --ridges:   fine flowing lines, for textured (embossed) full arts.
//   --cosmos:   overlapping soft discs and stars, for cosmos holo.
// Plus the era holo textures from holoTextures.ts (--cracked, --starlight, --tinsel, --waterweb).
// White on black: foil.css colours them and color-dodge makes the black disappear.
import { holoTextures } from "./holoTextures";

let done = false;

function texture(size: number, draw: (g: CanvasRenderingContext2D, rnd: () => number) => void): string | undefined {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (!g) return;
  g.fillStyle = "#000";
  g.fillRect(0, 0, size, size);
  draw(g, Math.random);
  return `url(${c.toDataURL()})`;
}

/** Draws a shape at (x, y) and at its wrapped copies, so the tile repeats without seams. */
function wrapped(size: number, x: number, y: number, r: number, draw: (x: number, y: number) => void) {
  for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) if (x + dx > -r && x + dx < size + r && y + dy > -r && y + dy < size + r) draw(x + dx, y + dy);
}

export function ensureSparkles() {
  if (done || typeof document === "undefined") return;
  done = true;
  const root = document.documentElement.style;
  const set = (name: string, url: string | undefined) => url && root.setProperty(name, url);

  set(
    "--sparkles",
    texture(180, (g, rnd) => {
      for (let i = 0; i < 260; i++) {
        const r = rnd() < 0.08 ? 1.6 : rnd() * 0.9 + 0.3;
        g.fillStyle = `rgba(255,255,255,${rnd() * 0.8 + 0.2})`;
        g.beginPath();
        g.arc(rnd() * 180, rnd() * 180, r, 0, 7);
        g.fill();
      }
    }),
  );

  set(
    "--flecks",
    texture(160, (g, rnd) => {
      // Tiny angled flakes of varying brightness: they read as glitter once they drift against the tilt.
      for (let i = 0; i < 1400; i++) {
        const x = rnd() * 160, y = rnd() * 160, w = rnd() * 1.6 + 0.6, a = rnd() * Math.PI;
        g.fillStyle = `hsl(0 0% ${Math.round(35 + rnd() * 65)}%)`;
        wrapped(160, x, y, 2, (px, py) => {
          g.save();
          g.translate(px, py);
          g.rotate(a);
          g.fillRect(-w, -w / 3, w * 2, (w * 2) / 3);
          g.restore();
        });
      }
    }),
  );

  set(
    "--ridges",
    texture(256, (g, rnd) => {
      // Fine flowing lines, like the embossing on textured full arts (real ones follow the artwork; these
      // just meander). Built from sines with whole periods across the tile, so it repeats seamlessly.
      const S = 256, TAU = Math.PI * 2;
      const waves = Array.from({ length: 3 }, (_, i) => ({ kx: i + 1, ky: 1 + Math.floor(rnd() * 3), amp: 10 / (i + 1), ph: rnd() * TAU }));
      const bend = (x: number, y: number) => waves.reduce((d, w) => d + w.amp * Math.sin(TAU * ((w.kx * x) / S + (w.ky * y) / S) + w.ph), 0);
      g.lineWidth = 1.1;
      for (let y0 = 0; y0 < S; y0 += 4) {
        g.strokeStyle = `hsl(0 0% ${Math.round(55 + rnd() * 45)}%)`;
        for (const dy of [-S, 0, S]) {
          g.beginPath();
          for (let x = 0; x <= S; x += 4) {
            const y = y0 + dy + bend(x, y0);
            if (x === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
          g.stroke();
        }
      }
    }),
  );

  set(
    "--cosmos",
    texture(256, (g, rnd) => {
      // Soft discs in a few sizes, then pinpoint stars on top.
      g.globalCompositeOperation = "lighter";
      for (let i = 0; i < 90; i++) {
        const x = rnd() * 256, y = rnd() * 256, r = rnd() < 0.15 ? 26 + rnd() * 20 : 6 + rnd() * 16;
        const shade = 30 + rnd() * 50;
        wrapped(256, x, y, r, (px, py) => {
          const grad = g.createRadialGradient(px, py, r * 0.55, px, py, r);
          grad.addColorStop(0, `hsl(0 0% ${shade * 0.35}%)`);
          grad.addColorStop(0.85, `hsl(0 0% ${shade}%)`);
          grad.addColorStop(1, "#000");
          g.fillStyle = grad;
          g.beginPath();
          g.arc(px, py, r, 0, 7);
          g.fill();
        });
      }
      g.globalCompositeOperation = "source-over";
      for (let i = 0; i < 120; i++) {
        g.fillStyle = `rgba(255,255,255,${0.4 + rnd() * 0.6})`;
        g.beginPath();
        g.arc(rnd() * 256, rnd() * 256, rnd() < 0.1 ? 1.4 : 0.6, 0, 7);
        g.fill();
      }
    }),
  );

  for (const [name, url] of Object.entries(holoTextures())) set(name, url);
}
