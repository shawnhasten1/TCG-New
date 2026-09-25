import { describe, expect, it } from "vitest";
import { PACK_MARKUP, packPrice, shopPrice, TIER_FLOOR } from "./shop";

describe("packPrice", () => {
  it("marks the average value of a pack up", () => {
    expect(packPrice(500, "common")).toBe(700);
    expect(packPrice(2000, "common")).toBe(2800);
    expect(packPrice(500, "common")).toBeGreaterThan(500 * PACK_MARKUP - 1);
  });

  it("never goes below the set tier's minimum, which rises with scarcity", () => {
    expect(packPrice(10, "common")).toBe(TIER_FLOOR.common);
    expect(packPrice(10, "legendary")).toBe(TIER_FLOOR.legendary);
    expect(TIER_FLOOR.common).toBeLessThan(TIER_FLOOR.uncommon);
    expect(TIER_FLOOR.uncommon).toBeLessThan(TIER_FLOOR.rare);
    expect(TIER_FLOOR.rare).toBeLessThan(TIER_FLOOR.legendary);
  });

  it("rounds up to tidy amounts, never down", () => {
    expect(packPrice(333, "common")).toBe(470); // 466.2
    expect(packPrice(1001, "common")).toBe(1450); // 1401.4
    expect(packPrice(1000, "common") % 50).toBe(0);
  });
});

describe("shopPrice", () => {
  it("only prices sets it sells", () => {
    expect(shopPrice("no-such-set")).toBeUndefined();
    expect(shopPrice("constructor")).toBeUndefined();
    expect(shopPrice("__proto__")).toBeUndefined();
  });
});
