// The collection: every pulled card, saved to IndexedDB when its pack is torn open.

import type { Finish, PulledCard } from "../engine/types";

export interface PullRecord {
  /** Auto-increment key. */
  id?: number;
  packId: string;
  setId: string;
  cardId: string;
  /** The card's number within its set, kept so progress can be counted without set data. */
  localId: string;
  finish: Finish;
  firstEdition: boolean;
  /** ISO timestamp. */
  openedAt: string;
}

const DB_NAME = "tcg-collection";
const STORE = "pulls";

let dbPromise: Promise<IDBDatabase> | undefined;

function db(): Promise<IDBDatabase> {
  return (dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      store.createIndex("setId", "setId");
      store.createIndex("packId", "packId");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

function all<T>(req: IDBRequest<T[]>): Promise<T[]> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ---------- Change notifications (this tab and others) ---------- */

const events = new EventTarget();
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("tcg-collection") : undefined;
channel?.addEventListener("message", () => events.dispatchEvent(new Event("change")));

function changed() {
  events.dispatchEvent(new Event("change"));
  channel?.postMessage("change");
}

/** Calls `fn` whenever the collection changes. Returns an unsubscribe function. */
export function onCollectionChange(fn: () => void): () => void {
  events.addEventListener("change", fn);
  return () => events.removeEventListener("change", fn);
}

/* ---------- Reads and writes ---------- */

const newPackId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Saves one opened pack. Returns its pack id. */
export async function savePack(setId: string, pulls: PulledCard[], openedAt = new Date()): Promise<string> {
  const packId = newPackId();
  const tx = (await db()).transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  for (const p of pulls) {
    const record: PullRecord = {
      packId,
      setId,
      cardId: p.card.id,
      localId: p.card.localId,
      finish: p.finish,
      firstEdition: p.firstEdition,
      openedAt: openedAt.toISOString(),
    };
    store.add(record);
  }
  await done(tx);
  changed();
  return packId;
}

/** Every pull, or just one set's. */
export async function getPulls(setId?: string): Promise<PullRecord[]> {
  const store = (await db()).transaction(STORE, "readonly").objectStore(STORE);
  return all<PullRecord>(setId ? store.index("setId").getAll(setId) : store.getAll());
}

/** Deletes every record matching an index value, inside one transaction. */
async function deleteWhere(index: "packId" | "setId", value: string): Promise<void> {
  const tx = (await db()).transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  // Delete from the success callback, not after an await, so the transaction is still active.
  const req = store.index(index).getAllKeys(value);
  req.onsuccess = () => req.result.forEach((k) => store.delete(k));
  await done(tx);
  changed();
}

/** Removes every pull from one pack (e.g. undo). */
export function deletePack(packId: string): Promise<void> {
  return deleteWhere("packId", packId);
}

/** Wipes one set's pulls, or the whole collection. */
export async function clearPulls(setId?: string): Promise<void> {
  if (setId) return deleteWhere("setId", setId);
  const tx = (await db()).transaction(STORE, "readwrite");
  tx.objectStore(STORE).clear();
  await done(tx);
  changed();
}
