import { describe, expect, it } from "vitest";
import { artMask, layoutFor, layouts, reverseMask } from "./layouts";
import { foilTint, foilTreatment } from "./treatment";

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
