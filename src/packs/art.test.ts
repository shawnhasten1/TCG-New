import { describe, expect, it } from "vitest";
import { packArt, packArts, pickPackArt } from "./art";
import manifest from "./packArt.json";

describe("pack art", () => {
  const [setId, arts] = Object.entries(manifest).find(([, a]) => a.length > 1)!;

  it("picks each of a set's wrappers, at random", () => {
    const picked = new Set(arts.map((_, i) => pickPackArt(setId, () => (i + 0.5) / arts.length)));
    expect(picked).toEqual(new Set(arts.map((a) => a.id)));
  });

  it("has nothing for a set without photos", () => {
    expect(packArts("no-such-set")).toEqual([]);
    expect(pickPackArt("no-such-set")).toBeNull();
    expect(packArt("no-such-set", "x")).toBeUndefined();
  });

  it("finds a wrapper by id, and ignores ids it doesn't know", () => {
    expect(packArt(setId, arts[0].id)?.src).toBe(arts[0].src);
    expect(packArt(setId, "gone")).toBeUndefined();
    expect(packArt(setId, null)).toBeUndefined();
  });

  it("lists wrappers with ids unique in their set and a sensible shape", () => {
    for (const list of Object.values(manifest)) {
      expect(new Set(list.map((a) => a.id)).size).toBe(list.length);
      for (const a of list) {
        expect(a.src).toMatch(/^\/packs\/.+\.webp$/);
        expect(a.aspect).toBeGreaterThan(0.3);
        expect(a.aspect).toBeLessThan(1.2);
      }
    }
  });
});
