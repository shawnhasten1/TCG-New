import { describe, expect, it } from "vitest";
import { MIN_PACK_PRICE, PACK_MARKUP, packPrice, shopPrice } from "./shop";

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
