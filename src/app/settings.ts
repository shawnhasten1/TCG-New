// Per-browser preferences (sound, daily pack limit), kept in localStorage.
// The collection itself lives in IndexedDB; these are conveniences, so failures fall back to defaults.

import { useEffect, useState } from "react";

export interface Settings {
  sound: boolean;
  /** 0–1. */
  volume: number;
  /** Packs per day, recharging after they run out (see collection/daily.ts); 0 means unlimited. */
  dailyLimit: number;
  /** Eras packs are drawn from (pack profile ids); empty means every era. */
  eras: string[];
  /** Tilt cards by tilting the phone. */
  motion: boolean;
}

export const DEFAULTS: Settings = { sound: true, volume: 0.6, dailyLimit: 10, eras: [], motion: true };
const KEY = "tcg-pack-opener:settings";
/** Bumped when a default changes in a way stored settings should pick up. */
const VERSION = 2;
const events = new EventTarget();

export function getSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const { v, ...stored } = JSON.parse(raw) as Partial<Settings> & { v?: number };
      // Before v2, "unlimited" was the default and got saved with any other change; adopt the new default.
      if (!v && stored.dailyLimit === 0) delete stored.dailyLimit;
      return { ...DEFAULTS, ...stored };
    }
  } catch {
    // Private mode or blocked storage: use defaults.
  }
  return { ...DEFAULTS };
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...next, v: VERSION }));
  } catch {
    // Not persisted, but still applied for this session via the event below.
  }
  events.dispatchEvent(new CustomEvent("change", { detail: next }));
  return next;
}

/** Current settings, re-rendering when any component changes them. */
export function useSettings(): Settings {
  const [s, setS] = useState(getSettings);
  useEffect(() => {
    const on = (e: Event) => setS((e as CustomEvent<Settings>).detail);
    events.addEventListener("change", on);
    return () => events.removeEventListener("change", on);
  }, []);
  return s;
}
