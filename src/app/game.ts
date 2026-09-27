// The game this page load plays, read once at startup. Switching saves the choice and reloads, so every module
// (the collection's IndexedDB, sync, the pages) starts cleanly in the new game.
//
// Games other than Pokémon are demos the server has to turn on (DEMO_GAMES, see worker/games.ts). The app asks which
// are on at startup: the switch only shows once there's more than one, and a game that's been turned off since it
// was picked sends the app back to Pokémon.

import { useSyncExternalStore } from "react";
import { isGame, type Game, type GamesResponse } from "../game";

const KEY = "tcg-pack-opener:game";

function stored(): Game {
  try {
    const v = localStorage.getItem(KEY);
    if (isGame(v)) return v;
  } catch {
    // No localStorage (tests, blocked storage): Pokémon, as before games.
  }
  return "pokemon";
}

export const GAME: Game = stored();

/** Switches to another game: the app reloads on its opener. */
export function switchGame(game: Game): void {
  if (game === GAME) return;
  try {
    localStorage.setItem(KEY, game);
  } catch {
    return;
  }
  location.hash = "#/";
  location.reload();
}

/* ---------- Which games are on ---------- */

let available: Game[] = ["pokemon"];
const listeners = new Set<() => void>();

/** Asks the server which games are on. Called once at startup. */
export async function startGames(): Promise<void> {
  let games: Game[];
  try {
    const res = await fetch("/api/games");
    if (!res.ok) return;
    games = ((await res.json()) as GamesResponse).games.filter(isGame);
  } catch {
    // Offline: stay in whatever game this is, and leave the switch hidden until next time.
    return;
  }
  if (GAME !== "pokemon" && !games.includes(GAME)) {
    switchGame("pokemon");
    return;
  }
  available = games;
  for (const fn of listeners) fn();
}

/** The games the switch offers: just Pokémon until the server says otherwise. */
export function useGames(): Game[] {
  return useSyncExternalStore(
    (fn) => (listeners.add(fn), () => listeners.delete(fn)),
    () => available,
  );
}
