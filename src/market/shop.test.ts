import { describe, expect, it } from "vitest";
import { PACK_MARKUP, packPrice, shopPrice, TIER_FLOOR } from "./shop";

describe("packPrice", () => {
  it("charges the set tier's price, which rises with scarcity", () => {
    expect(packPrice(500, "common")).toBe(TIER_FLOOR.common);
    expect(packPrice(500, "legendary")).toBe(TIER_FLOOR.legendary);
    expect(TIER_FLOOR.common).toBeLessThan(TIER_FLOOR.uncommon);
    expect(TIER_FLOOR.uncommon).toBeLessThan(TIER_FLOOR.rare);
    expect(TIER_FLOOR.rare).toBeLessThan(TIER_FLOOR.legendary);
  });

  it("charges more for a set whose cards are worth nearly the tier's price, so reselling can't make coins", () => {
    const value = TIER_FLOOR.common; // cards worth the whole price
    expect(packPrice(value, "common")).toBeGreaterThanOrEqual(value * PACK_MARKUP);
    expect(packPrice(10_000, "common")).toBe(14_000);
  });

  it("rounds up to 50 coins, never down", () => {
    expect(packPrice(2001, "common")).toBe(2850); // 2801.4
    expect(packPrice(2000, "common")).toBe(2800);
  });
});

describe("shopPrice", () => {
  it("only prices sets it sells", () => {
    expect(shopPrice("no-such-set")).toBeUndefined();
    expect(shopPrice("constructor")).toBeUndefined();
    expect(shopPrice("__proto__")).toBeUndefined();
  });
});
