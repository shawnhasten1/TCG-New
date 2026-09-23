import { describe, expect, it } from "vitest";
import { priceFor } from "./prices";

// Shapes copied from real TCGdex responses (2026-09-22).
const charizard = { tcgplayer: { unit: "USD", holofoil: { marketPrice: 944.53 } }, cardmarket: { unit: "EUR", avg: 523.53, trend: 1009.26 } };
const bulbasaur151 = {
  tcgplayer: { unit: "USD", "reverse-holofoil": { marketPrice: 0.38 }, normal: { marketPrice: 0.26 } },
  cardmarket: { unit: "EUR", avg: 0.12, trend: 0.12, "avg-holo": 0.34, "trend-holo": 0.34 },
};

describe("priceFor", () => {
  it("uses the TCGplayer printing that matches the finish", () => {
    expect(priceFor(charizard, "holo")).toEqual({ amount: 944.53, currency: "USD", source: "TCGplayer" });
    expect(priceFor(bulbasaur151, "normal")?.amount).toBe(0.26);
    expect(priceFor(bulbasaur151, "reverse")?.amount).toBe(0.38);
  });

  it("prefers a 1st Edition printing when there is one, else falls back to unlimited", () => {
    const pricing = { tcgplayer: { "1st-edition-holofoil": { marketPrice: 5000 }, holofoil: { marketPrice: 900 } } };
    expect(priceFor(pricing, "holo", true)?.amount).toBe(5000);
    expect(priceFor(charizard, "holo", true)?.amount).toBe(944.53);
  });

  it("falls back to Cardmarket, using the -holo columns for reverse holos", () => {
    const cmOnly = { cardmarket: bulbasaur151.cardmarket };
    expect(priceFor(cmOnly, "normal")).toEqual({ amount: 0.12, currency: "EUR", source: "Cardmarket" });
    expect(priceFor(cmOnly, "reverse")?.amount).toBe(0.34);
  });

  it("returns undefined when there's no usable price", () => {
    expect(priceFor(null, "normal")).toBeUndefined();
    expect(priceFor({ tcgplayer: { normal: { marketPrice: 0 } } }, "normal")).toBeUndefined();
  });
});
