import { describe, expect, it } from "vitest";
import { artMask, layoutFor, layouts, reverseMask } from "./layouts";
import { foilStyle, foilTint, foilTreatment } from "./treatment";

describe("foilTreatment", () => {
  it.each([
    ["normal", "Common", "none"],
    ["normal", "Rare", "none"],
    ["reverse", "Common", "reverse"],
    ["reverse", "Rare", "reverse"],
    ["holo", "Rare", "holo"],
    ["holo", "Holo Rare", "holo"],
    ["holo", "Rare Holo", "holo"],
    ["holo", "Common", "holo"],
    ["holo", "Double rare", "fullart"],
    ["holo", "Holo Rare V", "fullart"],
    ["holo", "Holo Rare VMAX", "fullart"],
    ["holo", "Illustration rare", "fullart"],
    ["holo", "Special illustration rare", "fullart"],
    ["holo", "Radiant Rare", "fullart"],
    ["holo", "Ultra Rare", "etched"],
    ["holo", "Secret Rare", "etched"],
    ["holo", "Hyper rare", "etched"],
    ["holo", "Mega Hyper Rare", "etched"],
    ["holo", "Shiny Ultra Rare", "etched"],
  ] as const)("%s %s → %s", (finish, rarity, expected) => expect(foilTreatment(finish, rarity)).toBe(expected));

  it("tints hyper rares gold", () => {
    expect(foilTint("Hyper rare")).toBe("gold");
    expect(foilTint("Mega Hyper Rare")).toBe("gold");
    expect(foilTint("Ultra Rare")).toBe("rainbow");
  });

  it("tints secret Items, Tools, Stadiums and Energy gold, and secret Pokémon and Supporters rainbow", () => {
    expect(foilTint("Secret Rare", { category: "Trainer", trainerType: "Item" })).toBe("gold");
    expect(foilTint("Secret Rare", { category: "Trainer", trainerType: "Stadium" })).toBe("gold");
    expect(foilTint("Secret Rare", { category: "Energy" })).toBe("gold");
    expect(foilTint("Secret Rare", { category: "Trainer", trainerType: "Supporter" })).toBe("rainbow");
    expect(foilTint("Secret Rare", { category: "Pokemon" })).toBe("rainbow");
    // Older sets don't say what kind of Trainer it is: leave it rainbow.
    expect(foilTint("Secret Rare", { category: "Trainer" })).toBe("rainbow");
    expect(foilTint("Ultra Rare", { category: "Trainer", trainerType: "Item" })).toBe("rainbow");
  });
});

describe("foilStyle", () => {
  it.each([
    ["Radiant Rare", "radiant"],
    ["Amazing Rare", "amazing"],
    ["Shiny rare", "shiny"],
    ["Shiny rare V", "shiny"],
    ["Shiny rare VMAX", "shiny"],
    ["Shiny Ultra Rare", "shiny"],
    ["ACE SPEC Rare", "acespec"],
    ["Holo Rare V", "v"],
    ["Holo Rare VMAX", "vmax"],
    ["Holo Rare VSTAR", "vmax"],
    ["Promo", "cosmos"],
    ["Secret Rare", "rainbow"],
    ["Rare Holo", undefined],
    ["Ultra Rare", undefined],
    ["Hyper rare", undefined],
    ["Illustration rare", undefined],
  ] as const)("holo %s → %s", (rarity, expected) => expect(foilStyle("holo", rarity, { category: "Pokemon" })).toBe(expected));

  it("leaves gold secret rares to the gold tint", () => {
    expect(foilStyle("holo", "Secret Rare", { category: "Trainer", trainerType: "Item" })).toBeUndefined();
  });

  it("only styles holo pulls", () => {
    expect(foilStyle("reverse", "Radiant Rare")).toBeUndefined();
    expect(foilStyle("normal", "Holo Rare V")).toBeUndefined();
  });
});

describe("layouts", () => {
  it("maps series to frames, defaulting to the modern frame", () => {
    expect(layoutFor("base").id).toBe("wotc");
    expect(layoutFor("pl").id).toBe("dp");
    expect(layoutFor("me").id).toBe("sv");
    expect(layoutFor("unknown").id).toBe("sv");
  });

  it("keeps every art box inside the card border", () => {
    for (const l of layouts) {
      expect(l.art.x).toBeGreaterThan(l.border.x - 1);
      expect(l.art.y).toBeGreaterThan(l.border.y - 1);
      expect(l.art.x + l.art.w).toBeLessThan(100 - l.border.x + 1);
      expect(l.art.y + l.art.h).toBeLessThan(100);
    }
  });

  it("builds SVG data-URL masks", () => {
    const l = layoutFor("sv");
    expect(artMask(l)).toMatch(/^url\("data:image\/svg\+xml,/);
    expect(decodeURIComponent(reverseMask(l))).toContain("evenodd");
  });
});
