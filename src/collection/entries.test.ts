import { describe, expect, it } from "vitest";
import type { Card } from "../api/types";
import { cardsFor } from "../app/gameCards";
import { addEntries, newEntryIds } from "./entries";

const card = (id: string, extra: Partial<Card> = {}): Card => ({
  id,
  localId: id.split("-")[1],
  name: "Pikachu",
  rarity: "Common",
  variants: { normal: true, holo: false, reverse: false, firstEdition: false },
  category: "Pokemon",
  dexId: [25],
  ...extra,
});

// Tests run as Pokémon, where entries are Pokédex numbers.
describe("new entries", () => {
  it("marks cards of Pokémon not caught yet, counting a tag team if any Pokémon on it is new", () => {
    const pikachu = card("sv1-25");
    const tag = card("sm9-33", { name: "Pikachu & Zekrom GX", dexId: [25, 644] });
    const trainer = card("sv1-190", { category: "Trainer", dexId: null });
    expect(newEntryIds([pikachu, tag, trainer], new Set(["25"]))).toEqual(new Set(["sm9-33"]));
    expect(newEntryIds([pikachu, tag], new Set(["25", "644"]))).toEqual(new Set());
  });

  it("counts a saved pack's entries as had", () => {
    const had = new Set<string>();
    addEntries(had, [card("sm9-33", { dexId: [25, 644] })]);
    expect(had).toEqual(new Set(["25", "644"]));
  });

  it("indexes Magic cards by their oracle id, so every printing is one card", () => {
    const index = cardsFor("mtg").index!;
    const printing = (id: string) => card(id, { category: undefined, dexId: undefined, oracleId: "ef86989d-ce80-4e55-aece-7d11710eeffa" });
    expect(index.keys(printing("ons-321"))).toEqual(index.keys(printing("ktk-239")));
    expect(index.keys(card("x-1", { oracleId: null }))).toEqual([]);
    expect(index.badge).toBe("New card");
  });
});
