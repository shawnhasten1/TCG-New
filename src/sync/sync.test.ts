import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { addPulls, applyRemote, clearPulls, dropOutbox, getPulls, getSyncMeta, linkAccount, peekOutbox, toSyncPacks, unlinkAccount, type PullRecord } from "../collection/store";
import { parsePush, type RemotePack } from "./protocol";

const rec = (packId: string, cardId: string, setId = "s"): Omit<PullRecord, "id"> => ({ packId, setId, cardId, localId: "1", finish: "normal", firstEdition: false, openedAt: "2026-09-01T10:00:00.000Z" });
const remote = (packId: string, cardIds: string[], deleted = false, setId = "s"): RemotePack => ({
  packId,
  setId,
  openedAt: "2026-09-02T10:00:00.000Z",
  deleted,
  cards: deleted ? [] : cardIds.map((cardId) => ({ cardId, localId: "1", finish: "holo" as const, firstEdition: false })),
});

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
    await addPulls([rec("p1", "a"), rec("p1", "b"), rec("p2", "c")]);
    await clearPulls("s");
    expect(await drain()).toEqual([
      { op: "add", packs: toSyncPacks([rec("p1", "a"), rec("p1", "b"), rec("p2", "c")]) },
      { op: "deleteSet", setId: "s" },
    ]);
  });

  it("uploads a guest collection when it first joins an account, and drops it for a different account", async () => {
    await addPulls([rec("p1", "a")]);
    await clearPulls("gone");
    expect(await linkAccount("u1")).toBe("joined");
    // The guest-era outbox (including the delete) is replaced by one upload of what's here.
    expect(await drain()).toEqual([{ op: "add", packs: toSyncPacks([rec("p1", "a")]) }]);
    expect(await linkAccount("u1")).toBe("same");

    expect(await linkAccount("u2")).toBe("replaced");
    expect(await getPulls()).toEqual([]);
    expect(await getSyncMeta()).toEqual({ account: "u2", cursor: null });
  });

  it("applies remote packs and deletes, and keeps the cursor", async () => {
    await linkAccount("u1");
    await addPulls([rec("p1", "a")]);
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
    await addPulls(Array.from({ length: 150 }, (_, i) => rec(`p${i}`, "a")));
    await addPulls([rec("q", "a")]);
    const first = await peekOutbox(120);
    expect(first.map((e) => (e.op.op === "add" ? e.op.packs.length : 0))).toEqual([100]);
    await dropOutbox(first.map((e) => e.id));
    expect((await peekOutbox(120)).map((e) => (e.op.op === "add" ? e.op.packs.length : 0))).toEqual([50, 1]);
  });
});

describe("push validation", () => {
  it("accepts well-formed ops", () => {
    const ops = [{ op: "add", packs: toSyncPacks([rec("p1", "a")]) }, { op: "deletePacks", packIds: ["p1"] }, { op: "deleteSet", setId: "s" }, { op: "clear" }];
    expect(parsePush({ ops })).toEqual(ops);
  });

  it("rejects malformed or oversized pushes", () => {
    expect(() => parsePush({})).toThrow();
    expect(() => parsePush({ ops: [{ op: "nope" }] })).toThrow();
    expect(() => parsePush({ ops: [{ op: "add", packs: [{ ...toSyncPacks([rec("p1", "a")])[0], openedAt: "yesterday" }] }] })).toThrow();
    expect(() => parsePush({ ops: [{ op: "add", packs: [{ ...toSyncPacks([rec("p1", "a")])[0], cards: [{ cardId: "a", localId: "1", finish: "gold", firstEdition: false }] }] }] })).toThrow();
    const many = toSyncPacks(Array.from({ length: 201 }, (_, i) => rec(`p${i}`, "a")));
    expect(() => parsePush({ ops: [{ op: "add", packs: many }] })).toThrow(/Too many/);
  });
});
