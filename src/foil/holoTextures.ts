// Textures for the era holo patterns on the art box (layouts.ts holo), set on :root by ensureSparkles.
// Grey on black, like sparkles.ts: foil.css colours them and color-dodge drops the black.

function texture(size: number, draw: (g: CanvasRenderingContext2D, rnd: () => number) => void): string {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (!g) return "none";
  g.fillStyle = "#000";
  g.fillRect(0, 0, size, size);
  draw(g, Math.random);
  return `url(${c.toDataURL()})`;
}

/** Tileable Voronoi: calls shade(cellIndex, distToEdge) per pixel and writes the grey it returns (0–255). */
function voronoi(g: CanvasRenderingContext2D, S: number, n: number, rnd: () => number, shade: (i: number, edge: number, x: number, y: number) => number) {
  const cell = S / n;
  const pts = Array.from({ length: n * n }, (_, i) => ({ x: ((i % n) + 0.5 + (rnd() - 0.5) * 0.9) * cell, y: (Math.floor(i / n) + 0.5 + (rnd() - 0.5) * 0.9) * cell }));
  const wrap = (d: number) => (d > S / 2 ? d - S : d < -S / 2 ? d + S : d);
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let d1 = Infinity, d2 = Infinity, best = 0;
      for (let i = 0; i < pts.length; i++) {
        const dx = wrap(pts[i].x - x), dy = wrap(pts[i].y - y), d = dx * dx + dy * dy;
        if (d < d1) [d2, d1, best] = [d1, d, i];
        else if (d < d2) d2 = d;
      }
      const v = shade(best, Math.sqrt(d2) - Math.sqrt(d1), x, y);
      const o = (y * S + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

export function holoTextures(): Record<string, string> {
  return {
    // Cracked ice: angular shards of different brightness, each with a bright fracture line along its edge.
    "--cracked": texture(256, (g, rnd) => {
      const shades = Array.from({ length: 64 }, () => 40 + rnd() * 170);
      // Each shard gets a gentle gradient across it, so it catches the light like a tilted facet.
      const tilt = Array.from({ length: 64 }, () => [rnd() - 0.5, rnd() - 0.5]);
      voronoi(g, 256, 8, rnd, (i, edge, x, y) => (edge < 1.2 ? 255 : Math.max(0, Math.min(255, shades[i] + (x * tilt[i][0] + y * tilt[i][1]) * 0.6))));
    }),

    // Starlight (WOTC): scattered pinpoints and small four-pointed bursts.
    "--starlight": texture(200, (g, rnd) => {
      for (let i = 0; i < 180; i++) {
        g.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.5})`;
        g.beginPath();
        g.arc(rnd() * 200, rnd() * 200, rnd() * 0.9 + 0.3, 0, 7);
        g.fill();
      }
      for (let i = 0; i < 26; i++) {
        const x = rnd() * 200, y = rnd() * 200, r = 3 + rnd() * 6;
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, "#fff");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(x, y - r);
        g.quadraticCurveTo(x, y, x + r, y);
        g.quadraticCurveTo(x, y, x, y + r);
        g.quadraticCurveTo(x, y, x - r, y);
        g.quadraticCurveTo(x, y, x, y - r);
        g.fill();
      }
    }),

    // Tinsel (Black & White): fine, tight streaks at random angles.
    "--tinsel": texture(160, (g, rnd) => {
      g.lineCap = "round";
      for (let i = 0; i < 700; i++) {
        const x = rnd() * 160, y = rnd() * 160, a = rnd() * Math.PI, l = 2 + rnd() * 5;
        g.strokeStyle = `hsl(0 0% ${Math.round(30 + rnd() * 70)}%)`;
        g.lineWidth = 0.6 + rnd() * 0.6;
        for (const dx of [-160, 0, 160]) for (const dy of [-160, 0, 160]) {
          g.beginPath();
          g.moveTo(x + dx - Math.cos(a) * l, y + dy - Math.sin(a) * l);
          g.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l);
          g.stroke();
        }
      }
    }),

    // Water web (Sun & Moon): a wavy mesh, like light on the bottom of a pool.
    "--waterweb": texture(240, (g) => {
      const S = 240, T = (Math.PI * 2) / S;
      const img = g.createImageData(S, S);
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          // Two warped sine fields; bright where either is near zero, which draws a web of wavy lines.
          const a = Math.sin(3 * T * x + 1.2 * Math.sin(2 * T * y));
          const b = Math.sin(3 * T * y + 1.2 * Math.sin(2 * T * x + 1));
          const line = Math.max(Math.exp(-(a * a) * 18), Math.exp(-(b * b) * 18));
          const o = (y * S + x) * 4;
          img.data[o] = img.data[o + 1] = img.data[o + 2] = 30 + line * 225;
          img.data[o + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
    }),
  };
}
