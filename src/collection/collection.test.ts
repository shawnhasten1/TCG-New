import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { Card } from "../api/types";
import type { PulledCard } from "../engine/types";
import { isMainSet, ownership, setProgress, tallyBySet } from "./progress";
import { clearPulls, deletePack, getPulls, onCollectionChange, savePack, type PullRecord } from "./store";

const card = (id: string, localId: string, rarity = "Common"): Card => ({
  id,
  localId,
  name: id,
  image: "x",
  rarity,
  variants: { normal: true, reverse: true, holo: false, firstEdition: false },
});
const pull = (c: Card, finish: PulledCard["finish"] = "normal"): PulledCard => ({ card: c, finish, firstEdition: false, slot: "Common", outcome: c.rarity });

const a = card("s-1", "1");
const b = card("s-2", "2");
const secret = card("s-11", "11", "Secret Rare");

describe("collection store", () => {
  beforeEach(() => clearPulls());

  it("saves packs and reads them back by set", async () => {
    await savePack("p1", "s", [pull(a), pull(b, "reverse")]);
    await savePack("p2", "other", [pull(card("o-1", "1"))]);
    const pulls = await getPulls("s");
    expect(pulls.map((p) => [p.cardId, p.finish, p.localId])).toEqual([
      ["s-1", "normal", "1"],
      ["s-2", "reverse", "2"],
    ]);
    expect(await getPulls()).toHaveLength(3);
  });

  it("deletes one pack without touching others", async () => {
    const first = await savePack("p3", "s", [pull(a), pull(b)]);
    await savePack("p4", "s", [pull(a)]);
    await deletePack(first);
    expect((await getPulls("s")).map((p) => p.cardId)).toEqual(["s-1"]);
  });

  it("clears a single set", async () => {
    await savePack("p5", "s", [pull(a)]);
    await savePack("p6", "other", [pull(card("o-1", "1"))]);
    await clearPulls("s");
    expect((await getPulls()).map((p) => p.setId)).toEqual(["other"]);
  });

  it("notifies listeners on change", async () => {
    let calls = 0;
    const off = onCollectionChange(() => calls++);
    await savePack("p7", "s", [pull(a)]);
    off();
    await savePack("p8", "s", [pull(a)]);
    expect(calls).toBe(1);
  });
});

const rec = (cardId: string, localId: string, finish: PullRecord["finish"], packId: string, openedAt = "2026-01-01T00:00:00Z"): PullRecord => ({
  cardId,
  localId,
  finish,
  packId,
  setId: "s",
  firstEdition: false,
  openedAt,
});

describe("progress", () => {
  it("counts copies per finish and first/last pull dates", () => {
    const o = ownership([rec("s-1", "1", "normal", "p1", "2026-01-02"), rec("s-1", "1", "reverse", "p2", "2026-01-01"), rec("s-1", "1", "normal", "p3", "2026-01-03")]);
    expect(o.get("s-1")).toMatchObject({ total: 3, byFinish: { normal: 2, reverse: 1, holo: 0 }, firstPulledAt: "2026-01-01", lastPulledAt: "2026-01-03" });
  });

  it("treats numbered cards up to the official count as the main set", () => {
    expect(isMainSet("001", 165)).toBe(true);
    expect(isMainSet("165", 165)).toBe(true);
    expect(isMainSet("166", 165)).toBe(false);
    expect(isMainSet("TG01", 165)).toBe(false);
  });

  it("measures completion against pullable cards only", () => {
    const energy = card("s-10", "10");
    const cards = [a, b, energy, secret];
    const pullable = new Set([a.id, b.id, secret.id]); // the energy can't be pulled
    const pulls = [rec("s-1", "1", "normal", "p1"), rec("s-1", "1", "reverse", "p1"), rec("s-11", "11", "holo", "p2")];
    const p = setProgress(cards, 10, pulls, pullable);
    expect(p).toMatchObject({ mainOwned: 1, mainTotal: 2, allOwned: 2, allTotal: 3, percent: 50, pulls: 3, packs: 2, duplicates: 1 });
  });

  it("tallies sets from records alone", () => {
    const t = tallyBySet([rec("s-1", "1", "normal", "p1"), rec("s-1", "1", "normal", "p2"), rec("s-11", "11", "holo", "p2", "2026-02-01")], () => 10);
    expect(t.get("s")).toEqual({ setId: "s", pulls: 3, packs: 2, mainOwned: 1, lastOpenedAt: "2026-02-01" });
  });
});
