// Collection export as JSON, a copy to keep. There's no import: packs come from the server, and a file can be edited.

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
