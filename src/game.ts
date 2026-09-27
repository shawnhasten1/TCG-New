// Which trading card game: shared by the app and the Worker. An account is shared across games, but everything
// else belongs to one game: its collection, its pack allowance and the pack it's been dealt (the `game` column on
// the server). The game this page load plays is in app/game.ts.
//
// Pokémon is always on. The others are demos, off unless the Worker's DEMO_GAMES variable lists them (wrangler.jsonc
// leaves it empty, so production only has Pokémon; .dev.vars turns them on locally). See worker/games.ts.

export type Game = "pokemon" | "mtg";

export const GAMES: { id: Game; name: string; short: string }[] = [
  { id: "pokemon", name: "Pokémon", short: "PKMN" },
  { id: "mtg", name: "Magic: The Gathering", short: "MTG" },
];

export const isGame = (v: unknown): v is Game => GAMES.some((g) => g.id === v);

export const gameName = (game: Game) => GAMES.find((g) => g.id === game)!.name;

/** What GET /api/games answers: the games this deployment plays, Pokémon first. */
export interface GamesResponse {
  games: Game[];
}
