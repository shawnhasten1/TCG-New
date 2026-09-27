import { describe, expect, it } from "vitest";
import { openPack, packFinishes, whyNotOpenable } from "../engine/openPack";
import { createRng } from "../engine/rng";
import { rarityTier } from "../engine/tiers";
import { layoutFor, MTG_LAYOUTS } from "../foil/layouts";
import { rarityOf, scryfallImage, toSetData, type RawCard } from "./cards";
import { boosterEra, foilEra, MTG_PROFILES, MTG_SETS, mtgProfile, type MtgSet } from "./sets";

let n = 0;
function raw(rarity: string, over: Partial<RawCard> = {}): RawCard {
  n++;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    name: `Card ${n}`,
    collector_number: String(n),
    rarity,
    type_line: "Creature — Test",
    finishes: ["nonfoil", "foil"],
    booster: true,
    image_uris: {},
    ...over,
  };
}

const many = (count: number, rarity: string, over?: Partial<RawCard>) => Array.from({ length: count }, () => raw(rarity, over));
/** A set with enough of every rarity to fill any profile. */
const fullSet = () => [...many(60, "common"), ...many(40, "uncommon"), ...many(20, "rare"), ...many(8, "mythic"), ...many(5, "common", { type_line: "Basic Land — Forest" })];

const play: MtgSet = { id: "tst", name: "Test Set", released: "2024-06-01" };
const draft: MtgSet = { ...play, released: "2015-01-01" };
const classic: MtgSet = { ...play, released: "2000-01-01" };

describe("toSetData", () => {
  it("spells out rarities and gives basic lands their own", () => {
    expect(rarityOf(raw("mythic"))).toBe("Mythic Rare");
    expect(rarityOf(raw("common", { type_line: "Basic Land — Island" }))).toBe("Basic Land");
    expect(rarityOf(raw("common", { type_line: "Basic Snow Land — Island" }))).toBe("Basic Land");
    expect(rarityOf(raw("common", { type_line: "Land" }))).toBe("Common");
  });

  it("keeps booster cards with images, in collector number order", () => {
    n = 0;
    const cards = [raw("rare", { collector_number: "10" }), raw("common", { collector_number: "2" }), raw("common", { booster: false }), raw("common", { image_uris: undefined })];
    const data = toSetData(play, [...cards, raw("rare", { collector_number: "300", image_uris: undefined, card_faces: [{ image_uris: {} }, { image_uris: {} }] })]);
    expect(data.cards.map((c) => c.localId)).toEqual(["2", "10", "300"]);
    expect(data.cards[0].id).toBe("tst-2");
    expect(data.set.serie.id).toBe("mtg-modern");
    expect(data.cards[0].image).toBe(`/api/mtg/card/${cards[1].id}`);
  });

  it("maps finishes to printings", () => {
    const data = toSetData(play, [raw("common", { finishes: ["nonfoil"] }), raw("rare", { finishes: ["foil"] }), raw("rare", { finishes: ["etched"] })]);
    expect(data.cards.map((c) => [c.variants.normal, c.variants.holo])).toEqual([
      [true, false],
      [false, true],
      [false, true],
    ]);
  });

  it("links images by Scryfall id", () => {
    expect(scryfallImage("6f1a7590-3eee-4803-b192-d4fb771e6a86", "large")).toBe("https://cards.scryfall.io/large/front/6/f/6f1a7590-3eee-4803-b192-d4fb771e6a86.jpg");
  });
});

describe("eras", () => {
  it("picks the booster from the release date", () => {
    expect(boosterEra({ released: "2001-10-01" })).toBe("classic");
    expect(boosterEra({ released: "2008-10-03" })).toBe("draft");
    expect(boosterEra({ released: "2023-11-17" })).toBe("draft");
    expect(boosterEra({ released: "2024-02-09" })).toBe("play");
  });

  it("picks the foil era from the release date, with the dark-foil blocks by name", () => {
    expect(foilEra({ id: "ulg", released: "1999-02-15" })).toBe("premodern");
    expect(foilEra({ id: "scg", released: "2003-05-26" })).toBe("premodern");
    expect(foilEra({ id: "8ed", released: "2003-07-28" })).toBe("modern");
    expect(foilEra({ id: "lrw", released: "2007-10-12" })).toBe("dark");
    expect(foilEra({ id: "ala", released: "2008-10-03" })).toBe("modern");
  });
});

describe("profiles", () => {
  it("every set has a profile", () => {
    for (const s of MTG_SETS) expect(mtgProfile(s)).toBeDefined();
    expect(new Set(MTG_SETS.map((s) => s.id)).size).toBe(MTG_SETS.length);
  });

  it("fills packs of the right size", () => {
    const data = toSetData(play, fullSet());
    const sizes = { classic: 15, draft: 15, play: 14 };
    for (const [era, profile] of Object.entries(MTG_PROFILES)) {
      expect(whyNotOpenable(data, profile)).toBeUndefined();
      expect(openPack(data, profile, createRng("x"))).toHaveLength(sizes[era as keyof typeof sizes]);
    }
  });

  it("puts a basic land in the land slot only, and a foil in the foil slot", () => {
    const data = toSetData(play, fullSet());
    const rng = createRng("lands");
    for (let i = 0; i < 200; i++) {
      const pack = openPack(data, MTG_PROFILES.play, rng);
      for (const p of pack) expect(p.card.rarity === "Basic Land").toBe(p.slot === "Land");
      expect(pack.find((p) => p.slot === "Foil")!.finish).toBe("holo");
      expect(pack.find((p) => p.slot === "Rare")!.card.rarity).toMatch(/^(Rare|Mythic Rare)$/);
    }
  });

  it("gives a Draft Booster a foil about one pack in three", () => {
    const data = toSetData(draft, fullSet());
    const rng = createRng("foils");
    let foils = 0;
    let rareFoils = 0;
    const packs = 3000;
    for (let i = 0; i < packs; i++) {
      const foil = openPack(data, MTG_PROFILES.draft, rng).find((p) => p.finish === "holo");
      if (foil) foils++;
      if (foil && /Rare/.test(foil.card.rarity)) rareFoils++;
    }
    expect(foils / packs).toBeGreaterThan(0.29);
    expect(foils / packs).toBeLessThan(0.38);
    // About a tenth of foils are rare or mythic.
    expect(rareFoils / foils).toBeGreaterThan(0.05);
    expect(rareFoils / foils).toBeLessThan(0.16);
  });

  it("comes out plain when a set has no foils", () => {
    const data = toSetData(classic, fullSet().map((c) => ({ ...c, finishes: ["nonfoil"] })));
    const rng = createRng("old");
    for (let i = 0; i < 100; i++) for (const p of openPack(data, MTG_PROFILES.classic, rng)) expect(p.finish).toBe("normal");
    expect(packFinishes(data.cards[0], MTG_PROFILES.classic, false)).toEqual(["normal"]);
  });
});

describe("look", () => {
  it("tiers mythics above rares", () => {
    expect(rarityTier("Common")).toBe(0);
    expect(rarityTier("Uncommon")).toBe(0);
    expect(rarityTier("Rare")).toBe(1);
    expect(rarityTier("Mythic Rare")).toBe(2);
  });

  it("foils the whole card, by foil era", () => {
    expect(layoutFor("mtg-modern")).toBe(MTG_LAYOUTS.modern);
    expect(MTG_LAYOUTS.modern.rarityFoil?.("Common")).toEqual({ treatment: "traditional" });
    expect(MTG_LAYOUTS.premodern.rarityFoil?.("Rare")).toEqual({ treatment: "traditional", era: "premodern", mark: "star" });
    expect(MTG_LAYOUTS.dark.rarityFoil?.("Rare")).toEqual({ treatment: "traditional", era: "dark" });
  });

  it("gives each set its serie by foil era", () => {
    expect(toSetData({ id: "ody", name: "Odyssey", released: "2001-10-01" }, fullSet()).set.serie.id).toBe("mtg-premodern");
    expect(toSetData({ id: "lrw", name: "Lorwyn", released: "2007-10-12" }, fullSet()).set.serie.id).toBe("mtg-dark");
  });
});
