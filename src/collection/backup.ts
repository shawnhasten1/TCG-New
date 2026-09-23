// Collection export / import as JSON. Packs are the unit: a merge skips packs already present,
// so importing the same file twice doesn't duplicate anything.

import type { Finish } from "../engine/types";
import type { PullRecord } from "./store";

export const BACKUP_APP = "tcg-pack-opener";
export const BACKUP_VERSION = 1;

export type StoredPull = Omit<PullRecord, "id">;

export interface Backup {
  app: typeof BACKUP_APP;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  pulls: StoredPull[];
}

export function toBackup(pulls: PullRecord[], now = new Date()): Backup {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    pulls: pulls.map(({ packId, setId, cardId, localId, finish, firstEdition, openedAt }) => ({ packId, setId, cardId, localId, finish, firstEdition, openedAt })),
  };
}

const FINISHES = new Set<Finish>(["normal", "holo", "reverse"]);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/** Parses and validates a backup file. Throws an Error with a readable message. */
export function parseBackup(text: string): StoredPull[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  const b = data as Partial<Backup>;
  if (!b || typeof b !== "object" || b.app !== BACKUP_APP) throw new Error("That file isn't a Pack Opener backup.");
  if (b.version !== BACKUP_VERSION) throw new Error(`Unsupported backup version ${String(b.version)}.`);
  if (!Array.isArray(b.pulls)) throw new Error("The backup has no pulls list.");
  return b.pulls.map((p, i) => {
    const r = p as Partial<StoredPull>;
    const ok =
      isStr(r.packId) && isStr(r.setId) && isStr(r.cardId) && typeof r.localId === "string" && FINISHES.has(r.finish as Finish) && typeof r.firstEdition === "boolean" && isStr(r.openedAt) && !isNaN(Date.parse(r.openedAt));
    if (!ok) throw new Error(`Pull ${i + 1} in the backup is malformed.`);
    return { packId: r.packId!, setId: r.setId!, cardId: r.cardId!, localId: r.localId!, finish: r.finish!, firstEdition: r.firstEdition!, openedAt: r.openedAt! };
  });
}

export interface ImportPlan {
  toAdd: StoredPull[];
  packsAdded: number;
  packsSkipped: number;
}

/** What a merge would add: every incoming pack whose id isn't already in the collection. */
export function planMerge(existing: Pick<PullRecord, "packId">[], incoming: StoredPull[]): ImportPlan {
  const have = new Set(existing.map((p) => p.packId));
  const incomingPacks = new Set(incoming.map((p) => p.packId));
  const toAdd = incoming.filter((p) => !have.has(p.packId));
  const added = new Set(toAdd.map((p) => p.packId)).size;
  return { toAdd, packsAdded: added, packsSkipped: incomingPacks.size - added };
}
