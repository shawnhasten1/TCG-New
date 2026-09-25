// The Worker's TCGdex cache: D1, with the most recent entries also kept in memory for as long as the isolate lives.

import type { Cache } from "../src/api/cache";
import { createClient, type TcgdexClient } from "../src/api/tcgdex";

/** Entries kept in memory. A set's cards are around 100 KB, so this stays well under the isolate's memory. */
const MEMORY_ENTRIES = 40;
const memory = new Map<string, unknown>();

function remember(key: string, value: unknown) {
  memory.delete(key);
  memory.set(key, value);
  // Maps keep insertion order, so the first key is the least recently used.
  if (memory.size > MEMORY_ENTRIES) memory.delete(memory.keys().next().value!);
}

/**
 * Drops entries for past days (keys ending in a date, like prices and the set list), which are never read again.
 * Entries are only written when missing, so updated_at is when they were fetched.
 */
export async function pruneDailyEntries(db: D1Database): Promise<void> {
  await db
    .prepare("DELETE FROM api_cache WHERE key GLOB '*:[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND updated_at < ?")
    .bind(Date.now() - 2 * 24 * 60 * 60 * 1000)
    .run();
}

export function d1Cache(db: D1Database): Cache {
  return {
    async get<T>(key: string) {
      if (memory.has(key)) {
        const hit = memory.get(key) as T;
        remember(key, hit);
        return hit;
      }
      const row = await db.prepare("SELECT value FROM api_cache WHERE key = ?").bind(key).first<{ value: string }>();
      if (!row) return undefined;
      const value = JSON.parse(row.value) as T;
      remember(key, value);
      return value;
    },
    async set(key, value) {
      remember(key, value);
      await db.prepare("INSERT OR REPLACE INTO api_cache (key, value, updated_at) VALUES (?, ?, ?)").bind(key, JSON.stringify(value), Date.now()).run();
    },
    async delete(key) {
      memory.delete(key);
      await db.prepare("DELETE FROM api_cache WHERE key = ?").bind(key).run();
    },
  };
}

export const tcgdex = (env: Env): { client: TcgdexClient; cache: Cache } => {
  const cache = d1Cache(env.DB);
  return { client: createClient(cache), cache };
};
