import { describe, expect, it } from "vitest";
import type { Card, SetDetail } from "../api/types";
import type { Finish } from "../engine/types";
import { duplicatePicks, pickables, pickedUids } from "./PickGrid";
import type { PullRecord } from "./store";

const set = { id: "base1", name: "Base Set", releaseDate: "1999-01-09" } as unknown as SetDetail;
const pikachu = { id: "base1-58", localId: "58", name: "Pikachu", rarity: "Common", variants: {} } as Card;
const cards = new Map([[pikachu.id, { card: pikachu, set }]]);

let n = 0;
const pull = (finish: Finish, firstEdition = false): PullRecord => ({
  packId: `pack-${n++}`,
  slot: 0,
  setId: "base1",
  cardId: pikachu.id,
  localId: "58",
  finish,
  firstEdition,
  openedAt: "2026-09-25T00:00:00.000Z",
});
/** How many of each finish "Pick all duplicates" would sell, and how many it leaves. */
function dupes(pulls: PullRecord[], room = 30) {
  const items = pickables(pulls, cards);
  const picked = new Set(pickedUids(items, duplicatePicks(items, room)));
  const count = (sold: boolean) => {
    const out: Record<string, number> = {};
    for (const p of pulls) {
      if (picked.has(`${p.packId}:${p.slot}`) !== sold) continue;
      const k = `${p.firstEdition ? "1st " : ""}${p.finish}`;
      out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  };
  return { sold: count(true), kept: count(false) };
}

describe("Pick all duplicates", () => {
  it("never counts a holo as a duplicate of normal copies", () => {
    expect(dupes([pull("normal"), pull("normal"), pull("normal"), pull("holo")])).toEqual({ sold: { normal: 2 }, kept: { normal: 1, holo: 1 } });
  });

  it("keeps one of each finish: normal, holo and reverse holo", () => {
    expect(dupes([pull("normal"), pull("holo"), pull("holo"), pull("reverse"), pull("reverse")])).toEqual({
      sold: { holo: 1, reverse: 1 },
      kept: { normal: 1, holo: 1, reverse: 1 },
    });
  });

  it("keeps a 1st Edition copy apart from an unlimited one in the same finish", () => {
    expect(dupes([pull("holo", true), pull("holo")])).toEqual({ sold: {}, kept: { "1st holo": 1, holo: 1 } });
  });

  it("picks nothing when every finish has one copy", () => {
    expect(dupes([pull("normal"), pull("holo"), pull("reverse")]).sold).toEqual({});
  });

  it("stops at the room left on the market", () => {
    expect(dupes([pull("normal"), pull("normal"), pull("normal"), pull("normal")], 2).sold).toEqual({ normal: 2 });
  });
});
