import { describe, expect, it } from "vitest";
import { hiddenReason } from "./openable";
import { rarityKind, rarityTier } from "./tiers";

describe("rarityKind", () => {
  it.each([
    ["Common", "common"],
    ["Uncommon", "uncommon"],
    ["Rare Holo", "rare"],
    ["Double rare", "ultra"],
    ["Special illustration rare", "chase"],
  ] as const)("%s → %s", (rarity, kind) => expect(rarityKind(rarity)).toBe(kind));
});

describe("rarityTier", () => {
  it.each([
    ["Common", 0],
    ["Uncommon", 0],
    ["Rare", 1],
    ["Holo Rare", 1],
    ["Rare Holo", 1],
    ["Double rare", 2],
    ["Holo Rare V", 2],
    ["Holo Rare VMAX", 2],
    ["Ultra Rare", 2],
    ["Rare Holo LV.X", 2],
    ["Radiant Rare", 2],
    ["ACE SPEC Rare", 2],
    ["Illustration rare", 3],
    ["Special illustration rare", 3],
    ["Secret Rare", 3],
    ["Hyper rare", 3],
    ["Mega Hyper Rare", 3],
  ] as const)("%s → %i", (rarity, tier) => expect(rarityTier(rarity)).toBe(tier));
});

describe("hiddenReason", () => {
  const set = (id: string, name: string, serie: string, official = 150) => ({
    id,
    name,
    releaseDate: "2020-01-01",
    serie: { id: serie, name: serie },
    cardCount: { total: official, official },
  });
  it("offers normal expansions", () => {
    expect(hiddenReason(set("sv03.5", "151", "sv"))).toBeUndefined();
    expect(hiddenReason(set("base1", "Base Set", "base", 102))).toBeUndefined();
  });
  it("hides promos, energy, galleries, tiny sets and unmapped series", () => {
    expect(hiddenReason(set("svp", "SVP Black Star Promos", "sv"))).toMatch(/promo/i);
    expect(hiddenReason(set("sve", "Scarlet & Violet Energy", "sv"))).toMatch(/promo/i);
    expect(hiddenReason(set("swsh9tg", "Brilliant Stars Trainer Gallery", "swsh", 30))).toBeDefined();
    expect(hiddenReason(set("pop1", "POP Series 1", "pop", 17))).toMatch(/fewer/i);
    expect(hiddenReason(set("A1", "Genetic Apex", "tcgp"))).toMatch(/profile/i);
  });
});
