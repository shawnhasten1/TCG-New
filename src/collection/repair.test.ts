import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** A collection database at `version` with every store but wrappers, as half-applied dev builds left it. */
async function makeWithoutWrappers(version: number) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("tcg-collection", version);
    req.onupgradeneeded = () => {
      const pulls = req.result.createObjectStore("pulls", { keyPath: "id", autoIncrement: true });
      pulls.createIndex("setId", "setId");
      pulls.createIndex("packId", "packId");
      req.result.createObjectStore("outbox", { keyPath: "id", autoIncrement: true });
      req.result.createObjectStore("meta");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const tx = db.transaction("pulls", "readwrite");
  tx.objectStore("pulls").add({ packId: "p1", slot: 0, setId: "s", cardId: "a", localId: "1", finish: "normal", firstEdition: false, openedAt: "2026-09-01T00:00:00.000Z" });
  await new Promise((r) => (tx.oncomplete = r));
  db.close();
}

describe("repairing a collection database missing a store", () => {
  beforeEach(async () => {
    vi.resetModules();
    await new Promise((r) => (indexedDB.deleteDatabase("tcg-collection").onsuccess = r));
  });

  it.each([4, 5, 9])("adds wrappers to one at version %i and keeps the cards", async (version) => {
    await makeWithoutWrappers(version);
    const store = await import("./store");
    expect(await store.getWrappers()).toEqual([]);
    expect((await store.getPulls()).map((p) => p.cardId)).toEqual(["a"]);
  });

  it("opens a database already repaired past the app's version", async () => {
    await makeWithoutWrappers(9);
    await (await import("./store")).getWrappers(); // repaired to 10
    vi.resetModules();
    const store = await import("./store");
    expect((await store.getPulls()).map((p) => p.cardId)).toEqual(["a"]);
  });
});
