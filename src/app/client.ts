import { idbCache } from "../api/cache";
import { createClient } from "../api/tcgdex";

/** One shared, IndexedDB-cached API client for the app. */
export const cache = idbCache();
export const client = createClient(cache);

const UNOPENABLE_KEY = "unopenable-sets";

/** Sets that loaded but turned out unable to fill a pack, remembered so the picker can hide them. */
export async function getUnopenable(): Promise<Record<string, string>> {
  return (await cache.get<Record<string, string>>(UNOPENABLE_KEY)) ?? {};
}

export async function markUnopenable(setId: string, reason: string) {
  await cache.set(UNOPENABLE_KEY, { ...(await getUnopenable()), [setId]: reason });
}
