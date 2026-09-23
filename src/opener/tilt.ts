// Tilt engine ported from the prototype: eases toward a target and writes CSS variables
// (--rx, --ry, --px, --py, --o) onto whichever element is active.

interface TiltState {
  rx: number;
  ry: number;
  px: number;
  py: number;
  o: number;
}

const REST: TiltState = { rx: 0, ry: 0, px: 50, py: 50, o: 0.25 };

export class Tilt {
  private target = { ...REST };
  private cur = { ...REST };
  private el: HTMLElement | null = null;
  private maxTilt = 8;
  private raf = 0;

  constructor(private reduced: boolean) {}

  start() {
    const loop = () => {
      const { cur, target, el } = this;
      for (const k of Object.keys(cur) as (keyof TiltState)[]) cur[k] += (target[k] - cur[k]) * 0.12;
      if (el) {
        const s = el.style;
        s.setProperty("--rx", cur.rx.toFixed(2) + "deg");
        s.setProperty("--ry", cur.ry.toFixed(2) + "deg");
        s.setProperty("--px", cur.px.toFixed(2));
        s.setProperty("--py", cur.py.toFixed(2));
        s.setProperty("--o", cur.o.toFixed(3));
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  get active() {
    return this.el;
  }

  setActive(el: HTMLElement | null, maxTilt: number) {
    Object.assign(this.cur, REST);
    this.rest();
    this.el = el;
    this.maxTilt = maxTilt;
  }

  /** Aims the tilt at a viewport point over the active element. */
  aim(x: number, y: number) {
    if (!this.el) return;
    const r = this.el.getBoundingClientRect();
    const nx = Math.min(Math.max((x - r.left) / r.width, 0), 1);
    const ny = Math.min(Math.max((y - r.top) / r.height, 0), 1);
    const m = this.reduced ? this.maxTilt * 0.4 : this.maxTilt;
    Object.assign(this.target, { px: nx * 100, py: ny * 100, ry: (nx - 0.5) * 2 * m, rx: (0.5 - ny) * 2 * m, o: 1 });
  }

  /** Moves the aim point by a percentage of the element, for arrow keys. */
  nudge(dxPct: number, dyPct: number) {
    if (!this.el) return;
    const r = this.el.getBoundingClientRect();
    const px = Math.min(Math.max(this.target.px + dxPct, 0), 100);
    const py = Math.min(Math.max(this.target.py + dyPct, 0), 100);
    this.aim(r.left + (r.width * px) / 100, r.top + (r.height * py) / 100);
  }

  rest() {
    Object.assign(this.target, REST);
  }
}
