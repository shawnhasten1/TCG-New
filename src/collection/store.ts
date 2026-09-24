// The collection: every card you own, saved to IndexedDB when its pack is torn open (or when sync brings it).
// Every change is also queued in an outbox for syncing to the account (see sync/sync.ts).
// Cards traded away aren't kept; cards received in trades come in packs of their own (see sync/protocol.ts).

import type { Finish, PulledCard } from "../engine/types";
import { cardUid, type RemotePack, type SyncOp, type SyncPack } from "../sync/protocol";

export interface PullRecord {
  /** Auto-increment key. */
  id?: number;
  packId: string;
  /** Position in its pack; with the pack id, the card's identity (see cardUid). */
  slot: number;
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
/** Changes not yet pushed to the account, oldest first. */
const OUTBOX = "outbox";
/** Sync bookkeeping: which account this collection belongs to, and how far its changes have been pulled. */
const META = "meta";

let dbPromise: Promise<IDBDatabase> | undefined;

function db(): Promise<IDBDatabase> {
  return (dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 3);
    req.onupgradeneeded = (e) => {
      if (e.oldVersion < 1) {
        const store = req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        store.createIndex("setId", "setId");
        store.createIndex("packId", "packId");
      }
      if (e.oldVersion < 2) {
        req.result.createObjectStore(OUTBOX, { keyPath: "id", autoIncrement: true });
        req.result.createObjectStore(META);
      }
      if (e.oldVersion > 0 && e.oldVersion < 3) {
        // Records gained their position in the pack. Pull the whole collection again to get it.
        const tx = req.transaction!;
        tx.objectStore(STORE).clear();
        const meta = tx.objectStore(META);
        readMeta(meta, (m) => m.account && meta.put({ ...m, cursor: null } satisfies SyncMeta, "sync"));
      }
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

/** Fires in this tab only, when something here changed the collection, so there's something to push. */
const localWrites = new EventTarget();

function changedHere() {
  changed();
  localWrites.dispatchEvent(new Event("write"));
}

/** Calls `fn` after this tab changes the collection. Returns an unsubscribe function. */
export function onLocalWrite(fn: () => void): () => void {
  localWrites.addEventListener("write", fn);
  return () => localWrites.removeEventListener("write", fn);
}

/* ---------- Reads and writes ---------- */

/**
 * Saves a pack the server dealt, as it's torn (its deal id is its pack id), and queues opening it on the server.
 * Returns the pack id.
 */
export async function savePack(packId: string, setId: string, pulls: PulledCard[], openedAt = new Date()): Promise<string> {
  const tx = (await db()).transaction([STORE, OUTBOX], "readwrite");
  const store = tx.objectStore(STORE);
  pulls.forEach((p, slot) => {
    store.add({ packId, slot, setId, cardId: p.card.id, localId: p.card.localId, finish: p.finish, firstEdition: p.firstEdition, openedAt: openedAt.toISOString() } satisfies PullRecord);
  });
  tx.objectStore(OUTBOX).add({ op: "open", packId } satisfies SyncOp);
  await done(tx);
  changedHere();
  return packId;
}

/** A card's identity, from its record. */
export const pullUid = (p: Pick<PullRecord, "packId" | "slot">) => cardUid(p.packId, p.slot);

/** Every pull, or just one set's. */
export async function getPulls(setId?: string): Promise<PullRecord[]> {
  const store = (await db()).transaction(STORE, "readonly").objectStore(STORE);
  return all<PullRecord>(setId ? store.index("setId").getAll(setId) : store.getAll());
}

/** Deletes every record matching an index value (from a success callback, so the transaction is still active). */
function deleteWhere(store: IDBObjectStore, index: "packId" | "setId", value: string) {
  const req = store.index(index).getAllKeys(value);
  req.onsuccess = () => req.result.forEach((k) => store.delete(k));
}

/** Removes every pull from one pack (e.g. undo). */
export async function deletePack(packId: string): Promise<void> {
  const tx = (await db()).transaction([STORE, OUTBOX], "readwrite");
  deleteWhere(tx.objectStore(STORE), "packId", packId);
  tx.objectStore(OUTBOX).add({ op: "deletePacks", packIds: [packId] } satisfies SyncOp);
  await done(tx);
  changedHere();
}

/** Wipes one set's pulls, or the whole collection. */
export async function clearPulls(setId?: string): Promise<void> {
  const tx = (await db()).transaction([STORE, OUTBOX], "readwrite");
  if (setId) deleteWhere(tx.objectStore(STORE), "setId", setId);
  else tx.objectStore(STORE).clear();
  tx.objectStore(OUTBOX).add((setId ? { op: "deleteSet", setId } : { op: "clear" }) satisfies SyncOp);
  await done(tx);
  changedHere();
}

/* ---------- Sync bookkeeping ---------- */

/** Groups pull records into packs, the unit sync works in. */
export function toSyncPacks(records: Omit<PullRecord, "id">[]): SyncPack[] {
  const packs = new Map<string, SyncPack>();
  for (const r of records) {
    let p = packs.get(r.packId);
    if (!p) packs.set(r.packId, (p = { packId: r.packId, setId: r.setId, openedAt: r.openedAt, cards: [] }));
    p.cards.push({ cardId: r.cardId, localId: r.localId, finish: r.finish, firstEdition: r.firstEdition });
  }
  return [...packs.values()];
}

export interface OutboxEntry {
  id: number;
  op: SyncOp;
}

export interface SyncMeta {
  /** The account this device's collection belongs to; unset while playing as a guest. */
  account?: string;
  /** How far the account's changes have been pulled. */
  cursor?: string | null;
}

function readMeta(store: IDBObjectStore, then: (m: SyncMeta) => void) {
  const req = store.get("sync");
  req.onsuccess = () => then((req.result as SyncMeta | undefined) ?? {});
}

export async function getSyncMeta(): Promise<SyncMeta> {
  const tx = (await db()).transaction(META, "readonly");
  let meta: SyncMeta = {};
  readMeta(tx.objectStore(META), (m) => (meta = m));
  await done(tx);
  return meta;
}

/**
 * Ties this device's collection to an account before syncing. Anything else here is dropped and the
 * account's collection pulled fresh: a collection left from a different account stays with that account,
 * and one from before packs came from the server (a guest's, kept only on this device) can't be uploaded.
 */
export async function linkAccount(userId: string): Promise<"same" | "replaced"> {
  const tx = (await db()).transaction([STORE, OUTBOX, META], "readwrite");
  const pulls = tx.objectStore(STORE);
  const outbox = tx.objectStore(OUTBOX);
  const meta = tx.objectStore(META);
  // Set inside the callback below, which TypeScript can't see.
  let result = "same" as "same" | "replaced";
  readMeta(meta, (m) => {
    if (m.account === userId) return;
    result = "replaced";
    outbox.clear();
    pulls.clear();
    meta.put({ account: userId, cursor: null } satisfies SyncMeta, "sync");
  });
  await done(tx);
  if (result === "replaced") changed();
  return result;
}

/** Signing out: the collection stays with the account, so this device goes back to an empty guest one. */
export async function unlinkAccount(): Promise<void> {
  const tx = (await db()).transaction([STORE, OUTBOX, META], "readwrite");
  for (const name of [STORE, OUTBOX, META]) tx.objectStore(name).clear();
  await done(tx);
  changed();
}

/** The oldest queued changes, up to about `maxPacks` packs (always at least one entry if any are queued). */
export async function peekOutbox(maxPacks: number): Promise<OutboxEntry[]> {
  const tx = (await db()).transaction(OUTBOX, "readonly");
  const req = tx.objectStore(OUTBOX).openCursor();
  const entries: OutboxEntry[] = [];
  let packs = 0;
  req.onsuccess = () => {
    const c = req.result;
    if (!c) return;
    const { id, ...op } = c.value as SyncOp & { id: number };
    const size = op.op === "deletePacks" ? op.packIds.length : 1;
    if (entries.length && packs + size > maxPacks) return;
    entries.push({ id, op: op as SyncOp });
    packs += size;
    c.continue();
  };
  await done(tx);
  return entries;
}

export async function dropOutbox(ids: number[]): Promise<void> {
  const tx = (await db()).transaction(OUTBOX, "readwrite");
  for (const id of ids) tx.objectStore(OUTBOX).delete(id);
  await done(tx);
}

export async function outboxSize(): Promise<number> {
  const tx = (await db()).transaction(OUTBOX, "readonly");
  const req = tx.objectStore(OUTBOX).count();
  await done(tx);
  return req.result;
}

/**
 * Applies a page of the account's changes and records the new cursor, in one transaction.
 * A pack that changed (cards traded away, say) replaces this device's copy; its traded-away cards are left out.
 * Skipped if the device has since been unlinked or moved to another account. Packs this device
 * has deleted but not yet pushed stay deleted.
 */
export async function applyRemote(userId: string, packs: RemotePack[], cursor: string | null): Promise<void> {
  const tx = (await db()).transaction([STORE, OUTBOX, META], "readwrite");
  const pulls = tx.objectStore(STORE);
  const meta = tx.objectStore(META);
  let touched = false;
  readMeta(meta, (m) => {
    if (m.account !== userId) return;
    meta.put({ ...m, cursor } satisfies SyncMeta, "sync");
    const pending = tx.objectStore(OUTBOX).getAll();
    pending.onsuccess = () => {
      const ops = pending.result as SyncOp[];
      const deletedHere = (p: RemotePack) => ops.some((o) => o.op === "clear" || (o.op === "deleteSet" && o.setId === p.setId) || (o.op === "deletePacks" && o.packIds.includes(p.packId)));
      for (const p of packs) {
        const keys = pulls.index("packId").getAllKeys(p.packId);
        keys.onsuccess = () => {
          keys.result.forEach((k) => pulls.delete(k));
          touched ||= keys.result.length > 0;
          if (p.deleted || deletedHere(p)) return;
          p.cards.forEach(({ gone, ...c }, slot) => {
            if (gone) return;
            pulls.add({ packId: p.packId, slot, setId: p.setId, openedAt: p.openedAt, ...c } satisfies PullRecord);
            touched = true;
          });
        };
      }
    };
  });
  await done(tx);
  if (touched) changed();
}
