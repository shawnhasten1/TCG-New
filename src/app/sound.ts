// Sound effects, synthesized with Web Audio: no audio files to host or license.
// Browsers only allow audio after a user gesture; every sound here follows a tap, drag or key.

import { getSettings } from "./settings";

let ctx: AudioContext | undefined;
let master: GainNode | undefined;
let noise: AudioBuffer | undefined;

function audio(): { ac: AudioContext; out: GainNode } | undefined {
  const { sound, volume } = getSettings();
  if (!sound || typeof AudioContext === "undefined") return undefined;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
    master!.gain.value = volume * 0.8;
    return { ac: ctx, out: master! };
  } catch {
    return undefined;
  }
}

function whiteNoise(ac: AudioContext): AudioBuffer {
  if (noise) return noise;
  noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noise;
}

/** A filtered noise burst with an envelope. */
function burst(opts: { dur: number; type: BiquadFilterType; from: number; to: number; q?: number; gain: number; attack?: number; crackle?: boolean; delay?: number }) {
  const a = audio();
  if (!a) return;
  const { ac, out } = a;
  const t0 = ac.currentTime + (opts.delay ?? 0);
  const src = ac.createBufferSource();
  src.buffer = whiteNoise(ac);
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ac.createBiquadFilter();
  f.type = opts.type;
  f.Q.value = opts.q ?? 1;
  f.frequency.setValueAtTime(opts.from, t0);
  f.frequency.exponentialRampToValueAtTime(opts.to, t0 + opts.dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain, t0 + (opts.attack ?? 0.01));
  if (opts.crackle) {
    // Jagged amplitude for the paper/foil "rrrip".
    for (let t = 0.02; t < opts.dur; t += 0.012 + Math.random() * 0.02) g.gain.setValueAtTime(opts.gain * (0.35 + Math.random() * 0.65), t0 + t);
  }
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
  src.connect(f).connect(g).connect(out);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + opts.dur + 0.05);
}

/** A soft bell tone. */
function tone(freq: number, at: number, dur: number, gain: number, type: OscillatorType = "sine") {
  const a = audio();
  if (!a) return;
  const { ac, out } = a;
  const t0 = ac.currentTime + at;
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

const note = (semitonesFromA4: number) => 440 * 2 ** (semitonesFromA4 / 12);

export const sfx = {
  /** Foil wrapper tearing open. */
  tear() {
    burst({ dur: 0.42, type: "bandpass", from: 900, to: 3800, q: 0.9, gain: 0.5, crackle: true });
    burst({ dur: 0.25, type: "highpass", from: 3000, to: 6000, gain: 0.15, delay: 0.05 });
  },
  /** Cards sliding out of the pack. */
  slide() {
    burst({ dur: 0.45, type: "lowpass", from: 600, to: 2400, q: 0.7, gain: 0.22, attack: 0.08 });
  },
  /** Flicking to the next card. */
  flip() {
    burst({ dur: 0.09, type: "highpass", from: 1800, to: 4200, gain: 0.25, attack: 0.004 });
  },
  /** A hit, bigger with the tier: 1 rare, 2 ultra, 3 chase. */
  hit(tier: number) {
    if (tier <= 0) return;
    if (tier === 1) {
      tone(note(7), 0, 0.5, 0.18); // E5
      tone(note(14), 0.07, 0.6, 0.12); // B5
      return;
    }
    const steps = tier === 2 ? [7, 11, 14, 19] : [7, 11, 14, 19, 23, 26, 31];
    steps.forEach((s, i) => tone(note(s), i * 0.07, 0.7 + i * 0.05, 0.14, "triangle"));
    if (tier >= 3) {
      // Shimmer on top of the arpeggio.
      for (let i = 0; i < 10; i++) tone(note(31 + ((i * 5) % 12)), 0.45 + i * 0.06, 0.4, 0.05);
      burst({ dur: 1.2, type: "highpass", from: 5000, to: 9000, gain: 0.06, attack: 0.3, delay: 0.3 });
    }
  },
};
