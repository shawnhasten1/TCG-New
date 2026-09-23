import { describe, expect, it } from "vitest";
import type { SetSummary } from "../api/types";
import { drawableSets, eraOf, pickRandomSet } from "./randomSet";
import { createRng } from "./rng";
import type { SetTier } from "./setRarity";

const set = (id: string, serie: string, name = id, official = 150): SetSummary => ({
  id,
  name,
  releaseDate: "2020-01-01",
  serie: { id: serie, name: serie },
  cardCount: { total: official, official },
});

const sets = [
  set("base1", "base", "Base Set", 102),
  set("dp1", "dp", "Diamond & Pearl"),
  set("swsh7", "swsh", "Evolving Skies"),
  set("sv03.5", "sv", "151"),
  set("me01", "me", "Mega Evolution"),
  set("svp", "sv", "SVP Black Star Promos"),
  set("pop1", "pop", "POP Series 1", 17),
  set("A1", "tcgp", "Genetic Apex"),
];

describe("drawableSets", () => {
  it("only offers sets the set list would offer", () => {
    expect(drawableSets(sets).map((s) => s.id)).toEqual(["base1", "dp1", "swsh7", "sv03.5", "me01"]);
  });

  it("drops sets known not to fill a pack", () => {
    expect(drawableSets(sets, { unopenable: { swsh7: "No cards" } }).map((s) => s.id)).not.toContain("swsh7");
  });

  it("limits the draw by era, with an empty list meaning every era", () => {
    expect(drawableSets(sets, { eras: ["sv"] }).map((s) => s.id)).toEqual(["sv03.5", "me01"]);
    expect(drawableSets(sets, { eras: ["wotc", "swsh"] }).map((s) => s.id)).toEqual(["base1", "swsh7"]);
    expect(drawableSets(sets, { eras: [] })).toHaveLength(5);
    expect(eraOf(set("me01", "me"))).toBe("sv");
  });
});

describe("pickRandomSet", () => {
  it("covers every set in a tier roughly evenly", () => {
    const pool = drawableSets(sets);
    const rng = createRng("draw");
    const counts = new Map<string, number>();
    for (let i = 0; i < 5000; i++) {
      const s = pickRandomSet(pool, rng, undefined, () => "common")!;
      counts.set(s.id, (counts.get(s.id) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual(pool.map((s) => s.id).sort());
    for (const n of counts.values()) expect(n).toBeGreaterThan(850); // 1000 expected each
  });

  it("draws each tier at its odds, however many sets share it", () => {
    const tiers: Record<string, SetTier> = { base1: "legendary", dp1: "rare", swsh7: "uncommon", "sv03.5": "common", me01: "common" };
    const rng = createRng("tiers");
    const counts: Record<string, number> = {};
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const tier = tiers[pickRandomSet(drawableSets(sets), rng, undefined, (id) => tiers[id])!.id];
      counts[tier] = (counts[tier] ?? 0) + 1;
    }
    expect(counts.common / n).toBeCloseTo(0.7, 1);
    expect(counts.uncommon / n).toBeCloseTo(0.22, 1);
    expect(counts.rare / n).toBeCloseTo(0.07, 1);
    expect(counts.legendary / n).toBeGreaterThan(0.005);
    expect(counts.legendary / n).toBeLessThan(0.02);
  });

  it("avoids a given set when there is another choice", () => {
    const pool = drawableSets(sets, { eras: ["sv"] });
    const rng = createRng(1);
    for (let i = 0; i < 50; i++) expect(pickRandomSet(pool, rng, "sv03.5")!.id).toBe("me01");
    expect(pickRandomSet([pool[0]], rng, "sv03.5")!.id).toBe("sv03.5");
  });

  it("returns undefined when nothing is drawable", () => {
    expect(pickRandomSet([], createRng(1))).toBeUndefined();
  });
});
