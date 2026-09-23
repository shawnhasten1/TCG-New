// Jagged tear geometry from the prototype. The pack top and body are both full-size layers
// with identical backgrounds, clipped along the same tear line so they line up perfectly.

export const TEAR_Y = 14; // tear line height, % of pack

export type Point = [number, number];

export interface TearParts {
  packTop: HTMLElement;
  packBody: HTMLElement;
  guide: SVGPolylineElement;
  rip: SVGPolylineElement;
}

const pointsAttr = (pts: Point[]) => pts.map((p) => p.join(",")).join(" ");
const polygon = (pts: Point[]) => `polygon(${pts.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(",")})`;

/** Builds a fresh random tear line and crimped edges, and clips the layers to it. */
export function buildTear({ packTop, packBody, guide, rip }: TearParts): Point[] {
  const T = 28;
  const N = 22;
  const top: Point[] = [];
  const bottom: Point[] = [];
  for (let i = 0; i <= T; i++) {
    top.push([(i / T) * 100, i % 2 ? 1.4 : 0]);
    bottom.push([(i / T) * 100, 100 - (i % 2 ? 1.4 : 0)]);
  }
  const tear: Point[] = [];
  for (let i = 0; i <= N; i++) tear.push([(i / N) * 100, TEAR_Y + (i % 2 ? 0.9 : -0.9) + (Math.random() - 0.5) * 0.9]);
  packTop.style.clipPath = polygon([...top, ...[...tear].reverse()]);
  packBody.style.clipPath = polygon([...tear, ...[...bottom].reverse()]);
  guide.setAttribute("points", pointsAttr(tear));
  rip.setAttribute("points", pointsAttr(tear));
  return tear;
}

/** Points the rip animation in the drag direction. */
export function setRipDirection(rip: SVGPolylineElement, tear: Point[], dir: number) {
  rip.setAttribute("points", pointsAttr(dir > 0 ? tear : [...tear].reverse()));
}

/** Shows tear progress (0–1): lifts and rotates the top strip, draws the rip. */
export function setTearProgress({ packTop, guide, rip }: TearParts, progress: number, dir: number) {
  packTop.style.transformOrigin = `${dir > 0 ? 100 : 0}% ${TEAR_Y}%`;
  packTop.style.transform = `translateY(${-progress * 5}px) rotate(${dir * -progress * 6}deg)`;
  rip.setAttribute("stroke-dashoffset", String(1 - progress));
  guide.style.opacity = String(1 - progress);
}
