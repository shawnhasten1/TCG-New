import { describe, expect, it } from "vitest";
import { createRng } from "../engine/rng";
import { mtgArt, mtgPackArts, mtgPackArtSets, mtgPickPackArt, WRAPPER_ASPECT, WRAPPER_VERSION } from "./packArt";
import { boosterEra, MTG_SETS } from "./sets";
import { renderWrapper, setHue } from "./wrapper";

describe("Magic pack designs", () => {
  it("has designs for every set, each a card from it", () => {
    expect(mtgPackArtSets().sort()).toEqual(MTG_SETS.map((s) => s.id).sort());
    for (const s of MTG_SETS) {
      const arts = mtgPackArts(s.id);
      expect(arts.length).toBeGreaterThan(0);
      expect(new Set(arts.map((a) => a.id)).size).toBe(arts.length);
      for (const a of arts) {
        expect(a.src.startsWith(`/api/mtg/pack/v${WRAPPER_VERSION}/${s.id}/`) && a.src.endsWith(".svg")).toBe(true);
        expect(a.aspect).toBe(WRAPPER_ASPECT);
        expect(mtgArt(s.id, a.id)?.scryfallId).toMatch(/^[0-9a-f-]{36}$/);
      }
    }
  });

  it("picks one of the set's own designs", () => {
    const rng = createRng("wrappers");
    for (let i = 0; i < 50; i++) {
      const id = mtgPickPackArt("isd", rng);
      expect(mtgPackArts("isd").map((a) => a.id)).toContain(id);
    }
    expect(mtgPickPackArt("not-a-set")).toBeNull();
  });
});

describe("drawing a wrapper", () => {
  const input = { setId: "dsk", setName: "Duskmourn: House of Horror", cardName: `Tom & "Jerry" <3`, art: "data:image/jpeg;base64,AAAA", symbol: "data:image/svg+xml;base64,BBBB" };

  it.each(["classic", "draft", "play"] as const)("draws a well-formed %s wrapper, with names escaped", (era) => {
    const svg = renderWrapper({ ...input, era });
    // Every & starts an entity, and every tag that opens is closed or self-closing.
    expect(svg).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
    const opened = [...svg.matchAll(/<([a-zA-Z]+)[^>]*?(\/?)>/g)].filter((m) => !m[2]).map((m) => m[1]);
    const closed = [...svg.matchAll(/<\/([a-zA-Z]+)>/g)].map((m) => m[1]);
    expect(closed.sort()).toEqual(opened.sort());
    expect(svg).toContain("Tom &amp; &quot;Jerry&quot; &lt;3");
    expect(svg).toContain(input.art);
    expect(svg).toContain(input.symbol);
  });

  it("gives each set its own, stable colour", () => {
    expect(setHue("dsk")).toBe(setHue("dsk"));
    expect(new Set(MTG_SETS.map((s) => setHue(s.id))).size).toBeGreaterThan(MTG_SETS.length / 2);
    expect(MTG_SETS.some((s) => boosterEra(s) === "play")).toBe(true);
  });
});
