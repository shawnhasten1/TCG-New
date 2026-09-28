// Which trading card game: shared by the app and the Worker. An account is shared across games, but everything
// else belongs to one game: its collection, its pack allowance and the pack it's been dealt (the `game` column on
// the server). The game this page load plays is in app/game.ts.
//
// Pokémon is always on. The others are demos, off unless the Worker's DEMO_GAMES variable lists them (wrangler.jsonc
// leaves it empty, so production only has Pokémon; .dev.vars turns them on locally). See worker/games.ts.

export type Game = "pokemon" | "mtg" | "ygo";

/**
 * Parts of the app a game may not have yet. Pages ask whether the game has one (`has` in app/game.ts) rather than
 * which game it is, so giving Magic a feature is adding it to its list.
 * - sets: the set browser (#/sets).
 * - market: selling cards, the pack shop and unopened packs.
 * - social: friends, the feed and trades.
 * - pokedex: the Pokédex views, and "New entry" on the reveal.
 * - printings: Magic's card index, every printing of a card (by Scryfall's oracle id), and "New card" on the reveal.
 * - packArt: pack wrappers (photos of real packs, or drawn ones), and the Packs view that collects them.
 * - eraFilter: choosing which eras packs are drawn from, in Settings.
 * - setTiers: sets drawn by rarity tier, with pity.
 * - share: sharing cards to the feed from the reveal.
 */
export type Feature = "sets" | "market" | "social" | "pokedex" | "printings" | "packArt" | "eraFilter" | "setTiers" | "share";

export const GAMES: { id: Game; name: string; short: string; features: Feature[] }[] = [
  { id: "pokemon", name: "Pokémon", short: "PKMN", features: ["sets", "market", "social", "pokedex", "packArt", "eraFilter", "setTiers", "share"] },
  { id: "mtg", name: "Magic: The Gathering", short: "MTG", features: ["sets", "market", "social", "printings", "packArt", "eraFilter", "setTiers", "share"] },
  { id: "ygo", name: "Yu-Gi-Oh!", short: "YGO", features: ["sets", "market", "social", "printings", "packArt", "eraFilter", "setTiers", "share"] },
];

export const isGame = (v: unknown): v is Game => GAMES.some((g) => g.id === v);

export const gameName = (game: Game) => GAMES.find((g) => g.id === game)!.name;

/** What GET /api/games answers: the games this deployment plays, Pokémon first. */
export interface GamesResponse {
  games: Game[];
}
