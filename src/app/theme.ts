// Applies the theme setting: data-theme on <html> forces light or dark, and the browser chrome colour follows.
// index.html sets data-theme before first paint; this keeps it in step when the setting changes.

import { getSettings, onSettingsChange, type Theme } from "./settings";

/** Matches --stage in styles.css, the colour behind the top bar. */
const CHROME = { light: "#eceff2", dark: "#0d0f12" };

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const own = meta.media.includes("dark") ? "dark" : "light";
    meta.content = CHROME[theme === "system" ? own : theme];
  }
}

export function startTheme() {
  applyTheme(getSettings().theme);
  onSettingsChange((s) => applyTheme(s.theme));
}
