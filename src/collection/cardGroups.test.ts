import { describe, expect, it } from "vitest";
import type { Card, SetDetail } from "../api/types";
import { groupCards, sortRarities, type OwnedCard } from "./cardGroups";

const set = { id: "sv1", name: "Scarlet & Violet", serie: { id: "sv", name: "Scarlet & Violet" }, cardCount: { total: 258, official: 198 }, cards: [] } as unknown as SetDetail;
const entry = (id: string, rarity: string, byFinish: Partial<Record<"normal" | "holo" | "reverse", number>>, firstEdition = 0): OwnedCard => {
  const b = { normal: 0, holo: 0, reverse: 0, ...byFinish };
  return {
    card: { id, localId: id.split("-")[1], name: id, rarity, variants: {} } as Card,
    set,
    owned: { cardId: id, total: b.normal + b.holo + b.reverse, byFinish: b, firstEdition, firstPulledAt: "2026-01-01", lastPulledAt: "2026-01-02" },
  };
};

const entries = [
  entry("sv1-1", "Common", { normal: 2, reverse: 1 }),
  entry("sv1-2", "Illustration rare", { holo: 1 }),
  entry("sv1-3", "Rare", { holo: 1 }, 1),
  entry("sv1-4", "Uncommon", { normal: 1 }),
];

describe("sortRarities", () => {
  it("puts the rarest first", () => {
    expect(sortRarities(["Common", "Rare", "Illustration rare", "Double rare", "Uncommon"])).toEqual(["Illustration rare", "Double rare", "Rare", "Uncommon", "Common"]);
  });
});

describe("groupCards", () => {
  it("groups by rarity, rarest first, counting every copy", () => {
    const groups = groupCards(entries, { groupBy: "rarity", finish: "any", rarity: "all" });
    expect(groups.map((g) => g.key)).toEqual(["Illustration rare", "Rare", "Uncommon", "Common"]);
    expect(groups[3].tiles[0]).toMatchObject({ count: 3, finish: undefined });
  });

  it("filters rarity groups to cards owned in a finish", () => {
    const groups = groupCards(entries, { groupBy: "rarity", finish: "reverse", rarity: "all" });
    expect(groups.map((g) => g.key)).toEqual(["Common"]);
    expect(groups[0].tiles[0]).toMatchObject({ count: 1, finish: "reverse" });
  });

  it("groups by finish, listing a card under each finish it's owned in", () => {
    const groups = groupCards(entries, { groupBy: "finish", finish: "any", rarity: "all" });
    expect(groups.map((g) => [g.key, g.tiles.map((t) => `${t.card.id}×${t.count}`)])).toEqual([
      ["firstEdition", ["sv1-3×1"]],
      ["holo", ["sv1-2×1", "sv1-3×1"]],
      ["reverse", ["sv1-1×1"]],
      ["normal", ["sv1-1×2", "sv1-4×1"]],
    ]);
  });

  it("narrows finish groups to one rarity", () => {
    const groups = groupCards(entries, { groupBy: "finish", finish: "any", rarity: "Common" });
    expect(groups.map((g) => g.key)).toEqual(["reverse", "normal"]);
  });
});
