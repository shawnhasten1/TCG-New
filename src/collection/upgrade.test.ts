import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";

/** A collection database as the app left it before records had slots (version 2). */
async function makeV2() {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("tcg-collection", 2);
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
  const tx = db.transaction(["pulls", "outbox", "meta"], "readwrite");
  tx.objectStore("pulls").add({ packId: "p1", setId: "s", cardId: "a", localId: "1", finish: "normal", firstEdition: false, openedAt: "2026-09-01T00:00:00.000Z" });
  tx.objectStore("outbox").add({ op: "open", packId: "p2" });
  tx.objectStore("meta").put({ account: "u1", cursor: "9:p1" }, "sync");
  await new Promise((r) => (tx.oncomplete = r));
  db.close();
}

describe("upgrading the collection database", () => {
  it("pulls the whole collection again, so every record gets its slot, and keeps queued changes", async () => {
    await makeV2();
    const store = await import("./store");
    expect(await store.getPulls()).toEqual([]);
    expect(await store.getSyncMeta()).toEqual({ account: "u1", cursor: null });
    expect((await store.peekOutbox(10)).map((e) => e.op)).toEqual([{ op: "open", packId: "p2" }]);
  });
});
