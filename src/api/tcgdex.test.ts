import { describe, expect, it } from "vitest";
import { fixRarity } from "./tcgdex";
import type { Card } from "./types";

const card = (localId: string, rarity: string) =>
  ({ id: `pl4-${localId}`, localId, name: "Bagon", rarity, variants: { normal: false, reverse: true, holo: false, firstEdition: false } }) as Card;

describe("fixRarity", () => {
  it("marks DP/Platinum SH cards as shiny", () => {
    expect(fixRarity(card("SH10", "Rare")).rarity).toBe("Shiny rare");
    expect(fixRarity(card("SH1", "Rare Holo LV.X")).rarity).toBe("Shiny rare");
  });

  it("leaves other cards alone", () => {
    const c = card("52", "Common");
    expect(fixRarity(c)).toBe(c);
    expect(fixRarity(card("AR1", "Rare")).rarity).toBe("Rare");
  });
});
