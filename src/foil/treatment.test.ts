import { describe, expect, it } from "vitest";
import { ART_WINDOWS, artWindow, artWindowMask, cardKind, reverseWindowMask } from "./artWindows";
import { layoutFor, layouts } from "./layouts";
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
    ["holo", "Special illustration rare", "etched"],
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
    ["Double rare", "double"],
    ["Illustration rare", "illustration"],
    ["Special illustration rare", "special"],
    ["Ultra Rare", "ultra"],
    ["Hyper rare", undefined],
    ["Mega Hyper Rare", undefined],
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
    expect(layoutFor("sv").id).toBe("sv");
    expect(layoutFor("me").id).toBe("me");
    expect(layoutFor("unknown").id).toBe("me");
  });

  it("has an art window for every layout and card kind, inside the card border", () => {
    for (const l of layouts) {
      for (const kind of ["basic", "stage", "trainer"] as const) {
        const { art } = ART_WINDOWS[l.id][kind];
        expect(art.x0).toBeGreaterThan(l.border.x - 1);
        expect(art.y0).toBeGreaterThan(l.border.y - 1);
        expect(art.x1).toBeLessThan(100 - l.border.x + 1);
        expect(art.y1).toBeLessThan(100);
        expect(art.x0).toBeLessThan(art.x1);
        expect(art.y0).toBeLessThan(art.y1);
      }
    }
  });

  it("puts Trainer art below the name, lower than Pokémon art", () => {
    for (const l of layouts) expect(ART_WINDOWS[l.id].trainer.art.y0).toBeGreaterThan(ART_WINDOWS[l.id].basic.art.y0);
  });

  it("tells Trainers, Stage Pokémon and Basics apart", () => {
    expect(cardKind("Trainer", null)).toBe("trainer");
    expect(cardKind("Pokemon", "Basic")).toBe("basic");
    expect(cardKind("Pokemon", "Stage1")).toBe("stage");
    expect(cardKind("Pokemon", "Stage2")).toBe("stage");
    expect(cardKind("Pokemon", "VMAX")).toBe("stage");
    expect(cardKind("Pokemon", null)).toBe("basic");
    expect(cardKind("Energy", null)).toBe("basic");
  });

  it("builds SVG data-URL masks that cut the portrait out of Stage windows", () => {
    const l = layoutFor("xy");
    const stage = artWindow(l, "stage");
    expect(artWindowMask(stage)).toMatch(/^url\("data:image\/svg\+xml,/);
    expect(decodeURIComponent(artWindowMask(stage))).toContain("<ellipse");
    expect(decodeURIComponent(reverseWindowMask(stage, l))).toContain("<mask");
    expect(decodeURIComponent(artWindowMask(artWindow(l, "basic")))).not.toContain("<ellipse");
  });
});
