import { describe, expect, it } from "vitest";
import data from "./setRarity.json";
import { TIERS, drawWeights, pityFloor, setTier, type SetTier } from "./setRarity";

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

describe("pity", () => {
  const tiers: Record<string, SetTier> = { c: "common", u: "uncommon", r: "rare", l: "legendary" };
  const tierOf = (id: string) => tiers[id];
  const run = (id: string, n: number) => Array<string>(n).fill(id);

  it("guarantees a rare-or-better set on the 10th pack without one", () => {
    expect(pityFloor(run("c", 8), tierOf)).toBeUndefined();
    expect(pityFloor(run("c", 9), tierOf)).toBe("rare");
    expect(pityFloor([...run("c", 5), ...run("u", 4)], tierOf)).toBe("rare");
    expect(pityFloor([...run("c", 20), "r", ...run("c", 8)], tierOf)).toBeUndefined();
    expect(pityFloor([...run("c", 20), "l", ...run("c", 8)], tierOf)).toBeUndefined();
    expect(pityFloor([], tierOf)).toBeUndefined();
  });

  it("guarantees a legendary set on the 100th pack without one", () => {
    const rareEvery5 = Array.from({ length: 99 }, (_, i) => (i % 5 === 4 ? "r" : "c"));
    expect(pityFloor(rareEvery5.slice(1), tierOf)).toBeUndefined();
    expect(pityFloor(rareEvery5, tierOf)).toBe("legendary");
    expect(pityFloor(run("c", 99), tierOf)).toBe("legendary");
    expect(pityFloor([...rareEvery5, "l"], tierOf)).toBeUndefined();
  });

  it("a rare floor rules out lower tiers but keeps the legendary chance", () => {
    const [c, u, r, l] = drawWeights(["c", "u", "r", "l"], tierOf, "rare");
    expect(c).toBe(0);
    expect(u).toBe(0);
    expect(r).toBeCloseTo(0.99);
    expect(l).toBeCloseTo(0.01);
  });

  it("a legendary floor only draws legendary sets", () => {
    expect(drawWeights(["c", "u", "r", "l"], tierOf, "legendary")).toEqual([0, 0, 0, 1]);
  });

  it("ignores a floor the pool can't meet", () => {
    expect(drawWeights(["c", "u"], tierOf, "legendary")).toEqual(drawWeights(["c", "u"], tierOf));
    const [c, r] = drawWeights(["c", "r"], tierOf, "legendary");
    expect(c).toBeGreaterThan(r); // no legendary in the pool, so no floor at all
  });
});
