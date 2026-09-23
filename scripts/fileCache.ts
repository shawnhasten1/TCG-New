// Disk-backed cache for Node scripts, so repeated runs don't re-download sets.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Cache } from "../src/api/cache";

export function fileCache(dir = ".cache"): Cache {
  const path = (key: string) => join(dir, encodeURIComponent(key) + ".json");
  return {
    async get<T>(key: string) {
      try {
        return JSON.parse(await readFile(path(key), "utf8")) as T;
      } catch {
        return undefined;
      }
    },
    async set(key, value) {
      await mkdir(dir, { recursive: true });
      await writeFile(path(key), JSON.stringify(value));
    },
    async delete(key) {
      await rm(path(key), { force: true });
    },
  };
}
