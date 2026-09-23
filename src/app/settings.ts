// Per-browser preferences (sound, daily pack limit), kept in localStorage.
// The collection itself lives in IndexedDB; these are conveniences, so failures fall back to defaults.

import { useEffect, useState } from "react";

export interface Settings {
  sound: boolean;
  /** 0–1. */
  volume: number;
  /** Packs per day; 0 means unlimited. */
  dailyLimit: number;
  /** Eras packs are drawn from (pack profile ids); empty means every era. */
  eras: string[];
}

export const DEFAULTS: Settings = { sound: true, volume: 0.6, dailyLimit: 0, eras: [] };
const KEY = "tcg-pack-opener:settings";
const events = new EventTarget();

export function getSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // Private mode or blocked storage: use defaults.
  }
  return { ...DEFAULTS };
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
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
