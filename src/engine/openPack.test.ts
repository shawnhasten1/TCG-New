import { describe, expect, it } from "vitest";
import { groupByRarity } from "../api/tcgdex";
import type { Card, SetData, Variants } from "../api/types";
import { canOpen, openPack, preparePack } from "./openPack";
import { profileFor, profiles } from "./profiles";
import { createRng } from "./rng";
import { simulate } from "./simulate";
import type { PackProfile } from "./types";

let nextId = 0;
function card(rarity: string, variants: Partial<Variants> = {}, image = true): Card {
  const n = ++nextId;
  return {
    id: `test-${n}`,
    localId: String(n),
    name: `${rarity} ${n}`,
    image: image ? `https://example.test/${n}` : undefined,
    rarity,
    variants: { normal: true, reverse: false, holo: false, firstEdition: false, ...variants },
  };
}

function many(count: number, rarity: string, variants: Partial<Variants> = {}): Card[] {
  return Array.from({ length: count }, () => card(rarity, variants));
}

function setData(cards: Card[], serie = "sv"): SetData {
  return {
    set: {
      id: "test",
      name: "Test Set",
      serie: { id: serie, name: serie },
      cardCount: { total: cards.length, official: cards.length },
      cards: cards.map(({ id, localId, name, image }) => ({ id, localId, name, image })),
    },
    cards,
    byRarity: groupByRarity(cards),
    source: "graphql",
    fetchedAt: "2026-01-01T00:00:00Z",
  };
}

const svSet = () =>
  setData([
    ...many(40, "Common", { reverse: true }),
    ...many(30, "Uncommon", { reverse: true }),
    ...many(10, "Rare", { normal: false, holo: true, reverse: true }),
    ...many(8, "Double rare", { normal: false, holo: true }),
    ...many(6, "Illustration rare", { normal: false, holo: true }),
    ...many(4, "Special illustration rare", { normal: false, holo: true }),
    ...many(4, "Ultra Rare", { normal: false, holo: true }),
    ...many(2, "Hyper rare", { normal: false, holo: true }),
  ]);

const sv = profiles.find((p) => p.id === "sv")!;

describe("openPack", () => {
  it("is deterministic for a given seed", () => {
    const data = svSet();
    const ids = (seed: string) => openPack(data, sv, createRng(seed)).map((p) => `${p.card.id}:${p.finish}`);
    expect(ids("abc")).toEqual(ids("abc"));
    expect(ids("abc")).not.toEqual(ids("xyz"));
  });

  it("fills every slot, in profile order", () => {
    const pack = openPack(svSet(), sv, createRng(1));
    expect(pack).toHaveLength(sv.slots.reduce((n, s) => n + s.count, 0));
    expect(pack.map((p) => p.slot)).toEqual(sv.slots.flatMap((s) => Array(s.count).fill(s.label)));
  });

  it("reverse outcomes only use reverse-eligible cards and are always reverse", () => {
    const data = svSet();
    const rng = createRng("rev");
    for (let i = 0; i < 500; i++) {
      for (const p of openPack(data, sv, rng)) {
        if (p.outcome === "@reverse") {
          expect(p.finish).toBe("reverse");
          expect(p.card.variants.reverse).toBe(true);
        }
      }
    }
  });

  it("holo-only cards are always holo; normal-only cards are never holo", () => {
    const data = svSet();
    const rng = createRng("finish");
    for (let i = 0; i < 500; i++) {
      for (const p of openPack(data, sv, rng)) {
        if (p.outcome === "@reverse") continue;
        if (!p.card.variants.normal) expect(p.finish).toBe("holo");
        if (!p.card.variants.holo) expect(p.finish).toBe("normal");
      }
    }
  });

  it("never pulls cards without an image", () => {
    const data = setData([...svSet().cards, ...Array.from({ length: 50 }, () => card("Common", { reverse: true }, false))]);
    const rng = createRng("img");
    for (let i = 0; i < 300; i++) for (const p of openPack(data, sv, rng)) expect(p.card.image).toBeDefined();
  });

  it("avoids duplicates within a pack when the pool is big enough", () => {
    const data = svSet();
    const rng = createRng("dupes");
    for (let i = 0; i < 300; i++) {
      const ids = openPack(data, sv, rng).map((p) => p.card.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("drops selectors a set doesn't have and renormalizes", () => {
    const data = setData([
      ...many(20, "Common", { reverse: true }),
      ...many(20, "Uncommon", { reverse: true }),
      ...many(5, "Rare", { normal: false, holo: true, reverse: true }),
    ]);
    const prep = preparePack(data, sv);
    expect(Object.keys(prep.slots.at(-1)!.table)).toEqual(["Rare"]);
    for (const p of openPack(data, sv, createRng(3))) expect(["Common", "Uncommon", "Rare"]).toContain(p.card.rarity);
  });

  it("reports sets that can't fill a pack", () => {
    const promos = setData(many(30, "Promo"));
    expect(canOpen(promos, sv)).toBe(false);
    expect(() => openPack(promos, sv)).toThrow(/can't fill/);
    expect(preparePack(promos, sv).unusedRarities).toEqual(["Promo"]);
  });

  it("splits holo and non-holo rares that share a rarity string (Base Set)", () => {
    const data = setData(
      [
        ...many(40, "Common"),
        ...many(30, "Uncommon"),
        ...many(16, "Rare", { normal: false, holo: true }),
        ...many(16, "Rare", { normal: true, holo: false }),
      ],
      "base",
    );
    const wotc = profileFor(data.set)!;
    expect(wotc.id).toBe("wotc");
    const report = simulate(data, wotc, 6000, "base");
    const holo = report.byRarity.find((s) => s.key === "Rare (holo)")!;
    expect(holo.perPack).toBeGreaterThan(0.3);
    expect(holo.perPack).toBeLessThan(0.37);
  });

  it("uses profile odds and reverse fallback when a set has no variant data", () => {
    const data = setData([...many(40, "Common"), ...many(30, "Uncommon"), ...many(20, "Rare"), ...many(5, "Ultra Rare")], "sm");
    const classic = profileFor(data.set)!;
    const prep = preparePack(data, classic);
    expect(prep.variantDataMissing).toBe(true);
    expect(prep.emptySlots).toEqual([]);
    const report = simulate(data, classic, 3000, "sm");
    const keys = report.byRarity.map((s) => s.key);
    expect(keys).toContain("Rare (holo)");
    expect(keys).toContain("Common (reverse)");
    expect(keys).toContain("Ultra Rare (holo)");
    expect(keys).not.toContain("Ultra Rare (normal)");
  });

  it("applies firstEditionChance only to cards with a 1st Edition printing", () => {
    const data = setData([...many(20, "Common", { firstEdition: true }), ...many(10, "Uncommon"), ...many(5, "Rare", { firstEdition: true })], "base");
    const always: PackProfile = { ...profileFor(data.set)!, firstEditionChance: 1 };
    for (const p of openPack(data, always, createRng(9))) expect(p.firstEdition).toBe(p.card.variants.firstEdition);
  });
});

describe("simulate", () => {
  it("matches the SV rare slot table within tolerance", () => {
    const report = simulate(svSet(), sv, 20_000, "odds");
    const rate = (key: string) => report.bySlot["Rare"].find((s) => s.key === key)?.perPack ?? 0;
    const table = sv.slots.find((s) => s.label === "Rare")!.table;
    const present = ["Rare", "Double rare", "Ultra Rare", "Hyper rare"];
    const total = present.reduce((n, k) => n + table[k], 0);
    for (const k of present) expect(rate(`${k} (holo)`)).toBeCloseTo(table[k] / total, 1);
  });
});

describe("profiles", () => {
  it("maps each main serie to a profile and leaves non-pack series unmapped", () => {
    const id = (serie: string) => profileFor({ id: "x", serie: { id: serie } })?.id;
    expect(id("base")).toBe("wotc");
    expect(id("dp")).toBe("classic");
    expect(id("swsh")).toBe("swsh");
    expect(id("me")).toBe("sv");
    expect(id("tcgp")).toBeUndefined();
    expect(id("misc")).toBeUndefined();
  });
});
