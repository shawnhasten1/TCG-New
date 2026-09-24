// Keeps this device's collection in step with the signed-in account.
//
// The collection in IndexedDB is always what the app reads, so it works offline and without an account.
// When signed in, a sync pushes the outbox (changes made here) and then pulls whatever changed on the
// server since the last sync. It runs at startup, after changes here, when the tab comes back into view,
// when the connection returns, and every few minutes while the tab is open.

import { useEffect, useState } from "react";
import { ApiError, getAccount, onAccountChange, refreshAccount, signOutOfServer, api } from "../account/account";
import { refreshInbox } from "../social/friends";
import { applyRemote, dropOutbox, getSyncMeta, linkAccount, onLocalWrite, outboxSize, peekOutbox, unlinkAccount } from "../collection/store";
import { MAX_PUSH_PACKS, type ChangesResponse, type PushRequest } from "./protocol";

export interface SyncStatus {
  state: "idle" | "syncing" | "offline" | "error";
  /** Changes made here that haven't reached the account yet. */
  pending: number;
  lastSynced?: Date;
  error?: string;
}

let status: SyncStatus = { state: "idle", pending: 0 };
const events = new EventTarget();

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  events.dispatchEvent(new Event("change"));
}

export function useSyncStatus(): SyncStatus {
  const [s, setS] = useState(status);
  useEffect(() => {
    const on = () => setS(status);
    events.addEventListener("change", on);
    on();
    return () => events.removeEventListener("change", on);
  }, []);
  return s;
}

async function syncOnce(): Promise<void> {
  const { user } = getAccount();
  if (!user) return;
  await linkAccount(user.id);

  // Push first, so the pull can't bring back something deleted here.
  for (;;) {
    const entries = await peekOutbox(MAX_PUSH_PACKS);
    if (!entries.length) break;
    await api("/api/collection", { body: { ops: entries.map((e) => e.op) } satisfies PushRequest });
    await dropOutbox(entries.map((e) => e.id));
  }

  let { cursor } = await getSyncMeta();
  for (;;) {
    const page = await api<ChangesResponse>(`/api/collection${cursor ? `?since=${encodeURIComponent(cursor)}` : ""}`);
    await applyRemote(user.id, page.packs, page.cursor);
    cursor = page.cursor;
    if (!page.more) break;
  }
}

let running: Promise<void> | undefined;
let again = false;

/** Syncs now, or right after the sync already running. Never throws; problems show in the status. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      if (getAccount().status !== "signedIn") break;
      setStatus({ state: "syncing", error: undefined });
      try {
        // One tab at a time, where the browser supports it; running twice is harmless anyway.
        await (navigator.locks ? navigator.locks.request("tcg-sync", syncOnce) : syncOnce());
        setStatus({ state: "idle", lastSynced: new Date() });
        void refreshInbox();
      } catch (err) {
        const offline = err instanceof ApiError && err.status === 0;
        if (!offline) console.warn("Sync failed", err);
        setStatus({ state: offline ? "offline" : "error", error: err instanceof Error ? err.message : String(err) });
      }
    } while (again);
    setStatus({ pending: await outboxSize().catch(() => status.pending) });
  })().finally(() => (running = undefined));
  return running;
}

/** Signs out and returns this device to an empty guest collection. */
export async function signOut(): Promise<void> {
  await signOutOfServer();
  await unlinkAccount();
  setStatus({ state: "idle", pending: 0, lastSynced: undefined, error: undefined });
}

let started = false;

/** Wires up automatic syncing. Call once at startup. */
export function startSync(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const soon = (ms = 1500) => {
    clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), ms);
  };

  onLocalWrite(() => {
    setStatus({ pending: status.pending + 1 });
    soon();
  });
  onAccountChange(() => getAccount().status === "signedIn" && soon(0));
  addEventListener("online", () => soon(0));
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && soon(0));
  setInterval(() => document.visibilityState === "visible" && void syncNow(), 5 * 60 * 1000);

  void outboxSize().then((pending) => setStatus({ pending }), () => undefined);
  void refreshAccount().then((a) => a.status === "signedIn" && soon(0));
}
