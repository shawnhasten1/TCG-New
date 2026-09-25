import { describe, expect, it } from "vitest";
import { coinValue, formatCoins, UNPRICED_COINS } from "./protocol";

describe("coinValue", () => {
  it("counts a US cent as a coin", () => {
    expect(coinValue({ amount: 944.53, currency: "USD" }, "Rare Holo")).toEqual({ coins: 94453, priced: true });
    expect(coinValue({ amount: 0.26, currency: "USD" }, "Common")).toEqual({ coins: 26, priced: true });
  });

  it("converts euros at the fixed rate", () => {
    expect(coinValue({ amount: 10, currency: "EUR" }, "Rare").coins).toBe(1100);
  });

  it("never values a priced card at nothing", () => {
    expect(coinValue({ amount: 0.001, currency: "USD" }, "Common").coins).toBe(1);
  });

  it("falls back to the rarity's stand-in when there's no price", () => {
    expect(coinValue(undefined, "Common")).toEqual({ coins: UNPRICED_COINS.common, priced: false });
    expect(coinValue(undefined, "Uncommon").coins).toBe(UNPRICED_COINS.uncommon);
    expect(coinValue(undefined, "Special illustration rare").coins).toBe(UNPRICED_COINS.chase);
  });
});

describe("formatCoins", () => {
  it("groups digits and gets the plural right", () => {
    expect(formatCoins(1)).toBe("1 coin");
    expect(formatCoins(0)).toBe("0 coins");
    expect(formatCoins(1250)).toMatch(/^1.250 coins$/);
  });
});
