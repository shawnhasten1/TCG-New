import { describe, expect, it } from "vitest";
import { priceFor } from "../collection/prices";
import { isMainSet } from "../collection/progress";
import { openPack, packFinishes, whyNotOpenable } from "../engine/openPack";
import { createRng } from "../engine/rng";
import { rarityTier } from "../engine/tiers";
import { layoutFor } from "../foil/layouts";
import { rarityCode, toPricing, toSetData, ygoSetOf, type RawCard } from "./cards";
import { ygoFoil } from "./foil";
import { ygoPackArts, ygoPickPackArt } from "./packArt";
import { coreEra, OTHER_PROFILES, YGO_ERAS, YGO_SETS, YGO_SETS_SIGNATURE, ygoDrawableSets, ygoEra, ygoProfile, ygoSet, type YgoSet } from "./sets";

let passcode = 1000;
function raw(name: string, printings: [string, string, string?, string?][], setName = "Test Set"): RawCard {
  const id = passcode++;
  return {
    id,
    name,
    type: "Effect Monster",
    frameType: "effect",
    card_images: [{ id }],
    card_sets: printings.map(([code, rarity, rcode, price]) => ({ set_name: setName, set_code: code, set_rarity: rarity, set_rarity_code: rcode ?? `(${rarity[0]})`, set_price: price })),
  };
}

const classic: YgoSet = { id: "TST", name: "Test Set", released: "2002-01-01" };
const modern: YgoSet = { ...classic, released: "2024-02-08" };

describe("toSetData", () => {
  it("keeps English printings only when a set has regional codes", () => {
    const data = toSetData(classic, [
      raw("Dragon", [
        ["TST-001", "Ultra Rare", "(UR)"],
        ["TST-E001", "Ultra Rare", "(UR)"],
        ["TST-EN001", "Ultra Rare", "(UR)"],
      ]),
      raw("Goblin", [
        ["TST-002", "Common"],
        ["TST-EN002", "Common"],
      ]),
    ]);
    expect(data.cards.map((c) => c.id)).toEqual(["TST-EN001-UR", "TST-EN002-C"]);
  });

  it("falls back to the unprefixed codes when there are no English ones", () => {
    const data = toSetData(classic, [raw("Dragon", [["TST-001", "Rare", "(R)"], ["TST-E001", "Rare", "(R)"]])]);
    expect(data.cards.map((c) => c.id)).toEqual(["TST-001-R"]);
  });

  it("makes a card per rarity it's printed at, the plainest numbered as the main card and the rest as extras", () => {
    const data = toSetData(modern, [
      raw("Hero", [["TST-EN010", "Quarter Century Secret Rare", " "], ["TST-EN010", "Super Rare", "(SR)"]]),
      raw("Fiend", [["TST-EN002", "Common"]]),
      raw("Elsewhere", [["OTH-EN001", "Common"]], "Other Set"),
    ]);
    expect(data.cards.map((c) => [c.id, c.localId])).toEqual([
      ["TST-EN002-C", "002"],
      ["TST-EN010-SR", "010"],
      ["TST-EN010-QCSR", "010 QCSR"],
    ]);
    expect(data.set.cardCount).toEqual({ total: 3, official: 2 });
    expect(data.set.serie.id).toBe("ygo");
    expect(data.cards.map((c) => isMainSet(c.localId, data.set.cardCount.official, "ygo"))).toEqual([true, true, false]);
  });

  it("counts a card numbered 000 toward the main set, in Yu-Gi-Oh! only", () => {
    expect(isMainSet("000", 100, "ygo")).toBe(true);
    expect(isMainSet("157", 130, "ygo")).toBe(true);
    expect(isMainSet("000", 100, "pokemon")).toBe(false);
  });

  it("marks foil rarities as holo printings, and points images at the Worker", () => {
    const [c, sr] = toSetData(modern, [raw("A", [["TST-EN001", "Common"]]), raw("B", [["TST-EN002", "Super Rare", "(SR)"]])]).cards;
    expect(c.variants).toMatchObject({ normal: true, holo: false });
    expect(sr.variants).toMatchObject({ normal: false, holo: true });
    expect(sr.image).toMatch(/^\/api\/ygo\/card\/TST\/\d+$/);
    expect(sr.passcode).toBeGreaterThan(0);
  });

  it("reads a set listed under several names, fixes typos and leaves out placeholder rarities", () => {
    const split: YgoSet = { id: "TST", name: "Test Set", sources: ["Test Set a", "Test Set b"], released: "2011-01-01" };
    const data = toSetData(split, [
      raw("A", [["TST-EN001", "Duel Terminal Normal Parallel Rare", "(DNPR)"]], "Test Set a"),
      raw("B", [["TST-EN051", "PLatinum Secret Rare", "(PScR)"]], "Test Set b"),
      raw("C", [["TST-EN052", "New", ""]], "Test Set b"),
    ]);
    expect(data.cards.map((c) => [c.localId, c.rarity])).toEqual([
      ["001", "Duel Terminal Normal Parallel Rare"],
      ["051", "Platinum Secret Rare"],
    ]);
  });

  it("finds a card's set from its id", () => {
    expect(ygoSetOf("PHNI-EN059-QCScR")).toBe("PHNI");
    expect(ygoSetOf("LOB-001-UR")).toBe("LOB");
  });
});

describe("toPricing", () => {
  it("prices each printing in its own finish, and leaves out printings without a price", () => {
    const prices = toPricing(modern, [raw("Hero", [["TST-EN010", "Super Rare", "(SR)", "1.25"], ["TST-EN010", "Quarter Century Secret Rare", " ", "40.5"]]), raw("Fiend", [["TST-EN002", "Common", "(C)", "0.12"]]), raw("Imp", [["TST-EN003", "Common", "(C)", "0"]])]);
    expect(Object.keys(prices).sort()).toEqual(["TST-EN002-C", "TST-EN010-QCSR", "TST-EN010-SR"]);
    expect(priceFor(prices["TST-EN010-QCSR"], "holo")?.amount).toBe(40.5);
    expect(priceFor(prices["TST-EN002-C"], "normal")?.amount).toBe(0.12);
    expect(priceFor(prices["TST-EN002-C"], "holo")).toBeUndefined();
  });
});

describe("rarityCode", () => {
  it("strips YGOPRODeck's parentheses, or makes one from the name", () => {
    expect(rarityCode("Secret Rare", "(ScR)")).toBe("ScR");
    expect(rarityCode("Quarter Century Secret Rare", " ")).toBe("QCSR");
  });
});

/** A modern set shaped like Phantom Nightmare: 50 C, 26 SR, 14 UR, 10 ScR, and 25 QCSR reprints. */
function modernSet() {
  const cards: RawCard[] = [];
  const add = (n: number, rarity: string, code: string, from = 1) => {
    for (let i = 0; i < n; i++) cards.push(raw(`${rarity} ${i}`, [[`TST-EN${String(from + i).padStart(3, "0")}`, rarity, code]]));
  };
  add(50, "Common", "(C)", 1);
  add(26, "Super Rare", "(SR)", 51);
  add(14, "Ultra Rare", "(UR)", 77);
  add(10, "Secret Rare", "(ScR)", 91);
  add(25, "Quarter Century Secret Rare", " ", 51);
  return toSetData(modern, cards);
}

describe("Yu-Gi-Oh! sets", () => {
  it("have unique ids, in release order, each with a profile and an era", () => {
    expect(new Set(YGO_SETS.map((s) => s.id)).size).toBe(YGO_SETS.length);
    for (let i = 1; i < YGO_SETS.length; i++) expect(YGO_SETS[i].released >= YGO_SETS[i - 1].released).toBe(true);
    for (const s of YGO_SETS) {
      expect(ygoProfile(s).slots.length).toBeGreaterThan(0);
      expect(YGO_ERAS.map((e) => e.id)).toContain(ygoEra(s));
      expect(s.id).toMatch(/^[A-Z0-9]+$/);
    }
    expect(ygoSet("PHNI")?.name).toBe("Phantom Nightmare");
    expect(YGO_SETS_SIGNATURE).toContain(String(YGO_SETS.length));
  });

  it("go by era: the anime series for the draw, and three kinds of core booster", () => {
    expect(ygoEra(ygoSet("LOB")!)).toBe("dm");
    expect(ygoEra(ygoSet("TDGS")!)).toBe("5ds");
    expect(ygoEra(ygoSet("ROTD")!)).toBe("modern");
    expect(coreEra(ygoSet("PRIO")!)).toBe("classic");
    expect(coreEra(ygoSet("DUEA")!)).toBe("foil");
    expect(coreEra(ygoSet("ETCO")!)).toBe("modern");
    expect(ygoProfile(ygoSet("BLLR")!)).toBe(OTHER_PROFILES.battles);
  });

  it("limit the draw to the chosen eras, or none for every era", () => {
    expect(ygoDrawableSets([])).toHaveLength(YGO_SETS.length);
    expect(ygoDrawableSets(["nope"])).toHaveLength(YGO_SETS.length);
    const gx = ygoDrawableSets(["gx"]);
    expect(gx.length).toBeGreaterThan(5);
    expect(gx.every((s) => ygoEra(s) === "gx")).toBe(true);
  });

  it("have booster wrappers served from the app, most with one design and a few with several", () => {
    expect(ygoPackArts("LOB")).toHaveLength(1);
    expect(ygoPackArts("LOB")[0].src).toBe("/packs/ygo/LOB-1.webp");
    expect(ygoPackArts("BLMR")).toHaveLength(5);
    expect(ygoPackArts("DT02")).toEqual([]);
    expect(ygoPickPackArt("DT02")).toBeNull();
    expect(ygoPackArts("BLMR").map((a) => a.id)).toContain(ygoPickPackArt("BLMR", () => 0.99));
  });
});

describe("Yu-Gi-Oh! packs", () => {
  it("modern packs are 7 commons, a Super Rare and a foil, foils shining", () => {
    const data = modernSet();
    const profile = ygoProfile(modern);
    expect(whyNotOpenable(data, profile)).toBeUndefined();
    const rng = createRng("ygo");
    const foils: Record<string, number> = {};
    for (let i = 0; i < 2400; i++) {
      const pack = openPack(data, profile, rng);
      expect(pack).toHaveLength(9);
      expect(pack.slice(0, 7).every((p) => p.card.rarity === "Common" && p.finish === "normal")).toBe(true);
      expect(pack[7].card.rarity).toBe("Super Rare");
      expect(pack[8].finish).toBe("holo");
      foils[pack[8].card.rarity] = (foils[pack[8].card.rarity] ?? 0) + 1;
    }
    // Per 24-pack box: about 6 Ultra, 2 Secret and 1 Quarter Century Secret Rare.
    expect(foils["Ultra Rare"] / 100).toBeGreaterThan(5);
    expect(foils["Ultra Rare"] / 100).toBeLessThan(7);
    expect(foils["Quarter Century Secret Rare"] / 100).toBeGreaterThan(0.6);
    expect(foils["Quarter Century Secret Rare"] / 100).toBeLessThan(1.4);
  });

  it("a card only comes in its printing's finish", () => {
    const data = modernSet();
    const profile = ygoProfile(modern);
    const common = data.cards.find((c) => c.rarity === "Common")!;
    const secret = data.cards.find((c) => c.rarity === "Secret Rare")!;
    expect(packFinishes(common, profile, false)).toEqual(["normal"]);
    expect(packFinishes(secret, profile, false)).toEqual(["holo"]);
  });

  it("all-foil packs use Ultra Rares where a set has no Super Rares", () => {
    const cards = [...Array.from({ length: 10 }, (_, i) => raw(`U${i}`, [[`TST-EN${String(i + 1).padStart(3, "0")}`, "Ultra Rare", "(UR)"]])), ...Array.from({ length: 4 }, (_, i) => raw(`S${i}`, [[`TST-EN${String(i + 20).padStart(3, "0")}`, "Secret Rare", "(ScR)"]]))];
    const data = toSetData({ ...modern, pack: "mini" }, cards);
    const pack = openPack(data, OTHER_PROFILES.mini, createRng("mini"));
    expect(pack.map((p) => p.card.rarity)).toEqual(["Ultra Rare", "Ultra Rare", "Ultra Rare", "Ultra Rare", "Secret Rare"]);
  });
});

describe("Yu-Gi-Oh! rarities", () => {
  it("foil the art box for Super to Secret Rares and the whole card for collector rarities and parallels", () => {
    expect(ygoFoil("Common")).toBeUndefined();
    expect(ygoFoil("Rare")).toBeUndefined();
    expect(ygoFoil("Super Rare")?.treatment).toBe("holo");
    expect(ygoFoil("Ultra Rare")?.treatment).toBe("holo");
    expect(ygoFoil("Secret Rare")?.treatment).toBe("holo");
    expect(ygoFoil("Quarter Century Secret Rare")?.treatment).toBe("etched");
    expect(ygoFoil("Starlight Rare")?.treatment).toBe("etched");
    expect(ygoFoil("Duel Terminal Normal Parallel Rare")?.treatment).toBe("etched");
    expect(ygoFoil("Mosaic Rare")?.treatment).toBe("etched");
    expect(ygoFoil("Ultimate Rare")).toEqual({ treatment: "etched", tint: "gold" });
    expect(layoutFor("ygo").rarityFoil).toBe(ygoFoil);
  });

  it("rank for the reveal", () => {
    expect(rarityTier("Common")).toBe(0);
    expect(rarityTier("Short Print")).toBe(0);
    expect(rarityTier("Super Rare")).toBe(1);
    expect(rarityTier("Ultra Rare")).toBe(2);
    expect(rarityTier("Secret Rare")).toBe(3);
    expect(rarityTier("Starlight Rare")).toBe(3);
    expect(rarityTier("Ultimate Rare")).toBe(3);
    expect(rarityTier("Collector's Rare")).toBe(3);
  });
});
