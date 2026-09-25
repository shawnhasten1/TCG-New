import { describe, expect, it } from "vitest";
import { coinValue, FIRST_OFFER, formatCoins, LATER_OFFERS, OFFER_EVERY_MS, OFFER_GRACE_MS, offerFor, offerNumber, offerOpen, OFFERS, parseIds, UNPRICED_COINS } from "./protocol";

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

describe("offerFor", () => {
  const shares = (n: number) => Array.from({ length: 2000 }, (_, i) => offerFor(10_000, `seed-${i}`, n) / 10_000);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  it("is the same every time for a listing and offer number", () => {
    expect(offerFor(1234, "abc", 3)).toBe(offerFor(1234, "abc", 3));
    const run = Array.from({ length: OFFERS }, (_, n) => offerFor(1234, "abc", n));
    expect(new Set(run).size).toBeGreaterThan(OFFERS / 2);
  });

  it("keeps the first offer low and later ones around the value", () => {
    const first = shares(0);
    const later = shares(1);
    expect(Math.min(...first)).toBeGreaterThanOrEqual(FIRST_OFFER[0]);
    expect(Math.max(...first)).toBeLessThanOrEqual(FIRST_OFFER[1]);
    expect(Math.min(...later)).toBeGreaterThanOrEqual(LATER_OFFERS[0]);
    expect(Math.max(...later)).toBeLessThanOrEqual(LATER_OFFERS[1]);
    expect(mean(first)).toBeCloseTo(0.775, 1);
    expect(mean(later)).toBeCloseTo(0.915, 1);
  });

  it("never offers nothing", () => {
    expect(offerFor(1, "abc", 0)).toBe(1);
  });
});

describe("offer timing", () => {
  const at = 1_000_000;

  it("counts offers by the minute", () => {
    expect(offerNumber(at, at)).toBe(0);
    expect(offerNumber(at, at + OFFER_EVERY_MS - 1)).toBe(0);
    expect(offerNumber(at, at + OFFER_EVERY_MS)).toBe(1);
    expect(offerNumber(at, at - 5000)).toBe(0);
  });

  it("takes the offer that's up, or the last one just after it's replaced", () => {
    expect(offerOpen(at, 0, at)).toBe(true);
    expect(offerOpen(at, 0, at + OFFER_EVERY_MS + OFFER_GRACE_MS - 1)).toBe(true);
    expect(offerOpen(at, 0, at + OFFER_EVERY_MS + OFFER_GRACE_MS)).toBe(false);
  });

  it("refuses offers that haven't come yet, or past the last", () => {
    expect(offerOpen(at, 1, at)).toBe(false);
    expect(offerOpen(at, OFFERS, at + OFFERS * OFFER_EVERY_MS)).toBe(false);
    expect(offerOpen(at, OFFERS - 1, at + OFFERS * OFFER_EVERY_MS + OFFER_GRACE_MS)).toBe(false);
    expect(offerOpen(at, 0.5, at)).toBe(false);
  });
});

describe("parseIds", () => {
  const ok = (s: string) => s.length > 0;

  it("drops repeats", () => {
    expect(parseIds(["a", "b", "a"], ok, "card")).toEqual(["a", "b"]);
  });

  it("refuses nothing, too many, or junk", () => {
    expect(() => parseIds([], ok, "card")).toThrow(/at least one/);
    expect(() => parseIds(Array.from({ length: 31 }, (_, i) => `c${i}`), ok, "card")).toThrow(/more than/);
    expect(() => parseIds(["a", 3], ok, "card")).toThrow(/isn't a card/);
    expect(() => parseIds("a", ok, "card")).toThrow();
  });
});
