// Tilt engine: springs each value toward a target and writes CSS variables
// (--rx, --ry, --px, --py, --o) onto whichever element is active. foil.css derives the rest.

interface TiltState {
  rx: number;
  ry: number;
  px: number;
  py: number;
  o: number;
}

const REST: TiltState = { rx: 0, ry: 0, px: 50, py: 50, o: 0.25 };
const KEYS = Object.keys(REST) as (keyof TiltState)[];

/** Per-frame (60fps) spring constants. */
interface Spring {
  stiffness: number;
  damping: number;
}
/** Tight and slightly bouncy while the pointer drives it. */
const FOLLOW: Spring = { stiffness: 0.066, damping: 0.25 };
/** Loose and wobbly when it settles back. */
const SETTLE: Spring = { stiffness: 0.012, damping: 0.07 };
/** Critically damped, for reduced motion: no overshoot. */
const CALM: Spring = { stiffness: 0.06, damping: 2 * Math.sqrt(0.06) };

export class Tilt {
  private target = { ...REST };
  private cur = { ...REST };
  private vel: TiltState = { rx: 0, ry: 0, px: 0, py: 0, o: 0 };
  private spring = FOLLOW;
  private el: HTMLElement | null = null;
  private maxTilt = 8;
  private raf = 0;

  constructor(private reduced: boolean) {}

  start() {
    let last = performance.now();
    const loop = (now: number) => {
      // Frame-rate independent, in 60fps frames; capped so a background tab doesn't explode it.
      const dt = Math.min((now - last) / (1000 / 60), 3);
      last = now;
      const { cur, vel, target, el } = this;
      const { stiffness, damping } = this.reduced ? CALM : this.spring;
      for (const k of KEYS) {
        vel[k] += (stiffness * (target[k] - cur[k]) - damping * vel[k]) * dt;
        cur[k] += vel[k] * dt;
      }
      if (el) {
        const s = el.style;
        s.setProperty("--rx", cur.rx.toFixed(2) + "deg");
        s.setProperty("--ry", cur.ry.toFixed(2) + "deg");
        s.setProperty("--px", cur.px.toFixed(2));
        s.setProperty("--py", cur.py.toFixed(2));
        s.setProperty("--o", Math.max(cur.o, 0).toFixed(3));
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
    for (const k of KEYS) this.vel[k] = 0;
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
    this.spring = FOLLOW;
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
    this.spring = SETTLE;
    Object.assign(this.target, REST);
  }
}
