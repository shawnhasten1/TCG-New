import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { Card } from "../api/types";
import { applyRemote, clearPulls, dropOutbox, getPulls, getSyncMeta, linkAccount, peekOutbox, savePack, toSyncPacks, unlinkAccount, type PullRecord } from "../collection/store";
import type { PulledCard } from "../engine/types";
import { parsePush, type RemotePack } from "./protocol";

const rec = (packId: string, cardId: string, setId = "s"): Omit<PullRecord, "id"> => ({ packId, setId, cardId, localId: "1", finish: "normal", firstEdition: false, openedAt: "2026-09-01T10:00:00.000Z" });
const remote = (packId: string, cardIds: string[], deleted = false, setId = "s"): RemotePack => ({
  packId,
  setId,
  openedAt: "2026-09-02T10:00:00.000Z",
  deleted,
  cards: deleted ? [] : cardIds.map((cardId) => ({ cardId, localId: "1", finish: "holo" as const, firstEdition: false })),
});

const pulled = (...ids: string[]): PulledCard[] =>
  ids.map((id) => ({ card: { id, localId: "1" } as Card, finish: "normal", firstEdition: false, slot: "Common", outcome: "Common" }));

async function drain() {
  const entries = await peekOutbox(Infinity);
  await dropOutbox(entries.map((e) => e.id));
  return entries.map((e) => e.op);
}

describe("collection sync bookkeeping", () => {
  beforeEach(async () => {
    await unlinkAccount();
  });

  it("queues every local change in order", async () => {
    await linkAccount("u1");
    await savePack("p1", "s", pulled("a", "b"));
    await clearPulls("s");
    expect(await drain()).toEqual([
      { op: "open", packId: "p1" },
      { op: "deleteSet", setId: "s" },
    ]);
  });

  it("drops what's here when joining an account, since only the server's packs count", async () => {
    await savePack("p1", "s", pulled("a"));
    expect(await linkAccount("u1")).toBe("replaced");
    expect(await getPulls()).toEqual([]);
    expect(await drain()).toEqual([]);
    expect(await linkAccount("u1")).toBe("same");

    await savePack("p2", "s", pulled("b"));
    expect(await linkAccount("u2")).toBe("replaced");
    expect(await getPulls()).toEqual([]);
    expect(await getSyncMeta()).toEqual({ account: "u2", cursor: null });
  });

  it("applies remote packs and deletes, and keeps the cursor", async () => {
    await linkAccount("u1");
    await savePack("p1", "s", pulled("a"));
    await drain();
    await applyRemote("u1", [remote("p1", ["a"]), remote("p2", ["x", "y"])], "3:p2");
    expect((await getPulls()).map((p) => p.cardId).sort()).toEqual(["a", "x", "y"]);
    expect((await getSyncMeta()).cursor).toBe("3:p2");

    await applyRemote("u1", [remote("p1", [], true)], "4:p1");
    expect((await getPulls()).map((p) => p.cardId).sort()).toEqual(["x", "y"]);
  });

  it("doesn't bring back a pack deleted here but not yet pushed", async () => {
    await linkAccount("u1");
    await clearPulls("s");
    await applyRemote("u1", [remote("p9", ["z"])], "5:p9");
    expect(await getPulls()).toEqual([]);
  });

  it("ignores changes for an account this device no longer belongs to", async () => {
    await linkAccount("u1");
    await unlinkAccount();
    await applyRemote("u1", [remote("p1", ["a"])], "1:p1");
    expect(await getPulls()).toEqual([]);
  });

  it("splits a push into batches by pack count", async () => {
    await linkAccount("u1");
    await clearPulls("x");
    await clearPulls("y");
    await clearPulls("z");
    expect((await peekOutbox(2)).map((e) => e.op)).toEqual([
      { op: "deleteSet", setId: "x" },
      { op: "deleteSet", setId: "y" },
    ]);
  });
});

describe("push validation", () => {
  it("accepts well-formed ops", () => {
    const ops = [{ op: "open", packId: "p1" }, { op: "add", packs: toSyncPacks([rec("p1", "a")]) }, { op: "deletePacks", packIds: ["p1"] }, { op: "deleteSet", setId: "s" }, { op: "clear" }];
    expect(parsePush({ ops })).toEqual(ops);
  });

  it("rejects malformed or oversized pushes", () => {
    expect(() => parsePush({})).toThrow();
    expect(() => parsePush({ ops: [{ op: "nope" }] })).toThrow();
    expect(() => parsePush({ ops: [{ op: "open", packId: "" }] })).toThrow();
    expect(() => parsePush({ ops: [{ op: "add", packs: [{ ...toSyncPacks([rec("p1", "a")])[0], openedAt: "yesterday" }] }] })).toThrow();
    expect(() => parsePush({ ops: [{ op: "add", packs: [{ ...toSyncPacks([rec("p1", "a")])[0], cards: [{ cardId: "a", localId: "1", finish: "gold", firstEdition: false }] }] }] })).toThrow();
    const many = toSyncPacks(Array.from({ length: 201 }, (_, i) => rec(`p${i}`, "a")));
    expect(() => parsePush({ ops: [{ op: "add", packs: many }] })).toThrow(/Too many/);
  });
});
