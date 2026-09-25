import { describe, expect, it } from "vitest";
import { MAX_BUY_AT_ONCE, MAX_UNOPENED, maxQuantity, MIN_PACK_PRICE, PACK_MARKUP, packPrice, parseQuantity, shopPrice } from "./shop";

describe("packPrice", () => {
  it("marks the average value of a pack's cards up, so buying to resell loses coins", () => {
    expect(packPrice(1000)).toBe(1400);
    expect(packPrice(872)).toBeGreaterThanOrEqual(872 * PACK_MARKUP);
  });

  it("follows the set's value, however scarce the set", () => {
    expect(packPrice(200)).toBeLessThan(packPrice(900));
    expect(packPrice(900)).toBeLessThan(packPrice(6400));
  });

  it("never goes below the minimum", () => {
    expect(packPrice(0)).toBe(MIN_PACK_PRICE);
    expect(packPrice(10)).toBe(MIN_PACK_PRICE);
  });

  it("rounds up to 50 coins, never down", () => {
    expect(packPrice(2001)).toBe(2850); // 2801.4
    expect(packPrice(2000)).toBe(2800);
  });
});

describe("shopPrice", () => {
  it("only prices sets it sells", () => {
    expect(shopPrice("no-such-set")).toBeUndefined();
    expect(shopPrice("constructor")).toBeUndefined();
    expect(shopPrice("__proto__")).toBeUndefined();
  });
});

describe("maxQuantity", () => {
  it("is what you can afford", () => {
    expect(maxQuantity(1250, 5000, 0)).toBe(4);
    expect(maxQuantity(1250, 1249, 0)).toBe(0);
  });

  it("is capped by room for unopened packs, and per purchase", () => {
    expect(maxQuantity(100, 1_000_000, MAX_UNOPENED - 3)).toBe(3);
    expect(maxQuantity(100, 1_000_000, MAX_UNOPENED)).toBe(0);
    expect(maxQuantity(100, 1_000_000, 0)).toBe(MAX_BUY_AT_ONCE);
  });
});

describe("parseQuantity", () => {
  it("defaults to one pack", () => {
    expect(parseQuantity(undefined)).toBe(1);
  });

  it("takes whole numbers from 1 to the per-purchase cap", () => {
    expect(parseQuantity(3)).toBe(3);
    expect(parseQuantity(MAX_BUY_AT_ONCE)).toBe(MAX_BUY_AT_ONCE);
  });

  it("refuses anything else", () => {
    for (const v of [0, -1, 2.5, MAX_BUY_AT_ONCE + 1, "3", null, NaN]) expect(parseQuantity(v)).toBeUndefined();
  });
});
