// The browser's API cache, in IndexedDB.

import { memoryCache, type Cache } from "./cache";

const DB_NAME = "tcg-pack-opener";
const STORE = "api-cache";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(db: IDBDatabase, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = op(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

/** IndexedDB-backed cache. Falls back to memory if IndexedDB is unavailable (e.g. private mode). */
export function idbCache(): Cache {
  if (typeof indexedDB === "undefined") return memoryCache();
  let dbPromise: Promise<IDBDatabase> | undefined;
  const fallback = memoryCache();
  const db = () => (dbPromise ??= openDb());
  return {
    async get<T>(key: string) {
      try {
        return await run<T | undefined>(await db(), "readonly", (s) => s.get(key));
      } catch {
        return fallback.get<T>(key);
      }
    },
    async getMany<T>(keys: string[]) {
      try {
        const store = (await db()).transaction(STORE, "readonly").objectStore(STORE);
        return await Promise.all(
          keys.map(
            (key) =>
              new Promise<T | undefined>((resolve, reject) => {
                const req = store.get(key);
                req.onsuccess = () => resolve(req.result as T | undefined);
                req.onerror = () => reject(req.error);
              }),
          ),
        );
      } catch {
        return Promise.all(keys.map((key) => fallback.get<T>(key)));
      }
    },
    async set(key, value) {
      try {
        await run(await db(), "readwrite", (s) => s.put(value, key));
      } catch {
        await fallback.set(key, value);
      }
    },
    async delete(key) {
      try {
        await run(await db(), "readwrite", (s) => s.delete(key));
      } catch {
        await fallback.delete(key);
      }
    },
  };
}
