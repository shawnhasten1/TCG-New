// Which games this deployment plays. Pokémon always; the demos only when DEMO_GAMES lists them (comma-separated game
// ids, e.g. "mtg"). wrangler.jsonc sets it empty, so production is Pokémon only; .dev.vars turns demos on locally.
// A game that's off is refused everywhere a game is named: dealing, sync and its card data.

import { GAMES, isGame, type Game, type GamesResponse } from "../src/game";
import { HttpError, json, type Ctx } from "./http";

export function enabledGames(env: Env): Game[] {
  const demos = new Set((env.DEMO_GAMES ?? "").split(",").map((s) => s.trim()));
  return GAMES.map((g) => g.id).filter((id) => id === "pokemon" || demos.has(id));
}

/** The game a request names (Pokémon when it doesn't), refused if it's unknown or off here. */
export function requireGame(env: Env, value: unknown): Game {
  if (value === undefined || value === null) return "pokemon";
  if (!isGame(value) || !enabledGames(env).includes(value)) throw new HttpError(404, "That game isn't available here.");
  return value;
}

/** GET /api/games: the games on here. */
export function handleGames(ctx: Ctx): Response {
  if (ctx.req.method !== "GET") throw new HttpError(405, "Method not allowed");
  return json({ games: enabledGames(ctx.env) } satisfies GamesResponse);
}
