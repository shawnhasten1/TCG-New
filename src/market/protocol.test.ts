import { describe, expect, it } from "vitest";
import { bestOffer, coinValue, FIRST_OFFER, formatCoins, LATER_OFFERS, listingCloses, OFFER_EVERY_MS, OFFER_GRACE_MS, offerFor, offerOpen, OFFERS, offersIn, parseIds, TRAINERS, UNPRICED_COINS } from "./protocol";

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
  const offers = (n: number) => Array.from({ length: 2000 }, (_, i) => offerFor(10_000, `seed-${i}`, n));
  const shares = (n: number) => offers(n).map((o) => o.coins / 10_000);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  it("is the same every time for a listing and offer number", () => {
    expect(offerFor(1234, "abc", 3)).toEqual(offerFor(1234, "abc", 3));
    const run = Array.from({ length: OFFERS }, (_, n) => offerFor(1234, "abc", n).coins);
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

  it("has a trainer to match the offer: lowballs from youngsters, top offers from collectors", () => {
    const classOf = (from: string) => TRAINERS.find((t) => t.classes.some((c) => from.startsWith(`${c} `)));
    for (const o of [...offers(0), ...offers(1)]) {
      const group = classOf(o.from)!;
      expect(group).toBeDefined();
      const share = o.coins / 10_000;
      // Rounding to whole coins can put a share a hair either side of a group's cutoff.
      expect(share).toBeGreaterThanOrEqual(group.from - 0.0001);
      const better = TRAINERS[TRAINERS.indexOf(group) - 1];
      if (better) expect(share).toBeLessThan(better.from + 0.0001);
    }
    expect(new Set(offers(1).map((o) => o.from)).size).toBeGreaterThan(50);
  });

  it("never offers nothing", () => {
    expect(offerFor(1, "abc", 0).coins).toBe(1);
  });
});

describe("offer timing", () => {
  const at = 1_000_000;

  it("brings in an offer at listing and one a minute after, up to the last", () => {
    expect(offersIn(at, at)).toBe(1);
    expect(offersIn(at, at + OFFER_EVERY_MS - 1)).toBe(1);
    expect(offersIn(at, at + OFFER_EVERY_MS)).toBe(2);
    expect(offersIn(at, at + 60 * OFFER_EVERY_MS)).toBe(OFFERS);
    expect(offersIn(at, at - 5000)).toBe(1);
  });

  it("keeps every offer that's come in open until the listing closes, and a moment after", () => {
    const closes = listingCloses(at);
    expect(offerOpen(at, 0, at)).toBe(true);
    expect(offerOpen(at, 0, closes - 1)).toBe(true);
    expect(offerOpen(at, 3, closes + OFFER_GRACE_MS - 1)).toBe(true);
    expect(offerOpen(at, 3, closes + OFFER_GRACE_MS)).toBe(false);
  });

  it("refuses offers that haven't come in, or aren't offers", () => {
    expect(offerOpen(at, 1, at)).toBe(false);
    expect(offerOpen(at, OFFERS, listingCloses(at) - 1)).toBe(false);
    expect(offerOpen(at, -1, at)).toBe(false);
    expect(offerOpen(at, 0.5, at)).toBe(false);
  });
});

describe("bestOffer", () => {
  it("takes the most coins, and the earliest of equals", () => {
    const a = { n: 0, coins: 10 };
    const b = { n: 1, coins: 12 };
    const c = { n: 2, coins: 12 };
    expect(bestOffer([a, b, c])).toBe(b);
    expect(bestOffer([])).toBeUndefined();
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
