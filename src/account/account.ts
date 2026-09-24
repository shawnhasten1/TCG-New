// The signed-in account, from the Worker's /api/auth endpoints. The last known user is remembered in
// localStorage so the app knows who's signed in straight away, and while offline.

import { useEffect, useState } from "react";
import type { MeResponse, PublicUser } from "../sync/protocol";

export interface AccountState {
  /** "unknown" until the server has answered once (or if it can't be reached and nothing is remembered). */
  status: "unknown" | "signedIn" | "signedOut";
  user: PublicUser | null;
  /** Whether "Continue with Google" is available. */
  google: boolean;
}

const KEY = "tcg:account";
const events = new EventTarget();

function remembered(): AccountState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as AccountState | null;
    if (s?.status === "signedIn" || s?.status === "signedOut") return s;
  } catch {
    // Nothing remembered.
  }
  return { status: "unknown", user: null, google: false };
}

let state = remembered();

function set(next: AccountState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Kept for this session only.
  }
  events.dispatchEvent(new Event("change"));
}

export const getAccount = () => state;

/** Signed up, rather than playing on a guest account (or not signed in at all). */
export const isMember = (s: AccountState) => s.status === "signedIn" && !!s.user && !s.user.guest;

export function useAccount(): AccountState {
  const [s, setS] = useState(state);
  useEffect(() => {
    const on = () => setS(state);
    events.addEventListener("change", on);
    on();
    return () => events.removeEventListener("change", on);
  }, []);
  return s;
}

export function onAccountChange(fn: () => void): () => void {
  events.addEventListener("change", fn);
  return () => events.removeEventListener("change", fn);
}

/* ---------- Requests ---------- */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init?.method ?? (init?.body === undefined ? "GET" : "POST"),
      headers: init?.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection.");
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    if (res.status === 401 && state.status === "signedIn" && !path.startsWith("/api/auth/")) sessionEnded();
    throw new ApiError(res.status, data.error ?? `Request failed (${res.status}).`);
  }
  return data;
}

/** Asks the server who's signed in. Keeps the remembered state if it can't be reached. */
export async function refreshAccount(): Promise<AccountState> {
  try {
    const me = await api<MeResponse>("/api/auth/me");
    set({ status: me.user ? "signedIn" : "signedOut", user: me.user, google: me.google });
  } catch (err) {
    if (err instanceof ApiError && err.status !== 0) console.warn("Couldn't check the account", err);
  }
  return state;
}

/** The server no longer accepts this device's session (expired, or the password changed elsewhere). */
function sessionEnded() {
  set({ ...state, status: "signedOut", user: null });
}

/** Starts a guest account for this browser, so the server can deal it packs. */
export async function startGuest(): Promise<PublicUser> {
  const { user } = await api<{ user: PublicUser }>("/api/auth/guest", { body: {} });
  set({ ...state, status: "signedIn", user });
  return user;
}

export async function signIn(email: string, password: string): Promise<void> {
  const { user } = await api<{ user: PublicUser }>("/api/auth/login", { body: { email, password } });
  set({ ...state, status: "signedIn", user });
}

export async function register(email: string, password: string, name: string): Promise<void> {
  const { user } = await api<{ user: PublicUser }>("/api/auth/register", { body: { email, password, name } });
  set({ ...state, status: "signedIn", user });
}

export async function changePassword(current: string, password: string): Promise<void> {
  const { user } = await api<{ user: PublicUser }>("/api/auth/password", { body: { current, password } });
  set({ ...state, user });
}

export async function signOutOfServer(): Promise<void> {
  await api("/api/auth/logout", { body: {} });
  set({ ...state, status: "signedOut", user: null });
}

export const GOOGLE_SIGN_IN = "/api/auth/google";
