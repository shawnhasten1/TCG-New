// Magic set data in the app: from the Worker (which keeps Scryfall's data, worker/mtg.ts), cached on the device.

import type { SetData } from "../api/types";
import { cache } from "../app/client";

/** Bump with the Worker's SET_VERSION. */
const key = (id: string) => `mtg:set:${id}:v2`;

export async function getMtgSet(id: string): Promise<SetData> {
  const hit = await cache.get<SetData>(key(id));
  if (hit) return hit;
  const res = await fetch(`/api/mtg/set/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Couldn't load the set (${res.status}).`);
  const data = (await res.json()) as SetData;
  await cache.set(key(id), data);
  return data;
}

/** Drops a set's cached cards, so the next getMtgSet fetches them fresh. */
export const forgetMtgSet = (id: string) => cache.delete(key(id));
