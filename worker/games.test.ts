import { describe, expect, it } from "vitest";
import { enabledGames, requireGame } from "./games";

describe("DEMO_GAMES", () => {
  const env = (DEMO_GAMES: string) => ({ DEMO_GAMES }) as Env;

  it("is Pokémon only when empty", () => {
    expect(enabledGames(env(""))).toEqual(["pokemon"]);
    expect(() => requireGame(env(""), "mtg")).toThrow();
    expect(requireGame(env(""), undefined)).toBe("pokemon");
    expect(requireGame(env(""), "pokemon")).toBe("pokemon");
  });

  it("turns on the games it lists, and ignores unknown ones", () => {
    expect(enabledGames(env(" mtg , ygo"))).toEqual(["pokemon", "mtg"]);
    expect(requireGame(env("mtg"), "mtg")).toBe("mtg");
    expect(() => requireGame(env("mtg"), "chess")).toThrow();
  });
});
