import { describe, expect, it } from "vitest";
import data from "./setRarity.json";
import { TIERS, drawWeights, setTier, type SetTier } from "./setRarity";

describe("drawWeights", () => {
  const tiers: Record<string, SetTier> = { a: "common", b: "common", c: "rare", d: "legendary" };
  const tierOf = (id: string) => tiers[id];

  it("splits a tier's odds across its sets and sums to 1", () => {
    const [a, b, c, d] = drawWeights(["a", "b", "c", "d"], tierOf);
    expect(a).toBeCloseTo(b);
    expect(a + b + c + d).toBeCloseTo(1);
    expect((a + b) / c).toBeCloseTo(70 / 7);
    expect(c / d).toBeCloseTo(7);
  });

  it("scales up when the pool lacks some tiers", () => {
    expect(drawWeights(["a", "b"], tierOf)).toEqual([0.5, 0.5]);
    const [, c] = drawWeights(["a", "c"], tierOf);
    expect(c).toBeCloseTo(7 / 77);
  });
});

describe("set rarity data", () => {
  it("treats sets without market data as common", () => {
    expect(setTier("not-a-set")).toBe("common");
  });

  it("puts scarce vintage sets above modern ones", () => {
    const rank = (id: string) => TIERS.findIndex((t) => t.id === setTier(id));
    expect(Object.keys(data.sets).length).toBeGreaterThan(50);
    expect(rank("ecard3")).toBeGreaterThan(rank("base1")); // Skyridge vs Base Set
    expect(rank("base1")).toBeGreaterThan(rank("sv01"));
    expect(setTier("sv01")).toBe("common");
  });
});
