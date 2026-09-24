// Friends from the Worker's /api/friends, and the inbox counts behind the badge in the top bar.
// The inbox refreshes after every sync (see sync/sync.ts), so it follows the same schedule.

import { useEffect, useState } from "react";
import { api, getAccount, onAccountChange } from "../account/account";
import type { FriendsResponse, InboxResponse } from "./protocol";

export const loadFriends = () => api<FriendsResponse>("/api/friends");
export const setDisplayName = (displayName: string) => api<FriendsResponse>("/api/friends/name", { body: { displayName } }).then(seen);
export const sendFriendRequest = (code: string) => api<FriendsResponse>("/api/friends/request", { body: { code } }).then(seen);
export const acceptFriend = (id: string) => api<FriendsResponse>(`/api/friends/${id}/accept`, { body: {} }).then(seen);
/** Declines a request, cancels one you sent, or removes a friend. */
export const removeFriend = (id: string) => api<FriendsResponse>(`/api/friends/${id}`, { method: "DELETE" }).then(seen);

/* ---------- Inbox ---------- */

const EMPTY: InboxResponse = { friendRequests: 0 };
let inbox = EMPTY;
const events = new EventTarget();

function setInbox(next: InboxResponse) {
  inbox = next;
  events.dispatchEvent(new Event("change"));
}

/** A fresh friends list already says how many requests are waiting, so the badge needn't ask again. */
function seen(res: FriendsResponse): FriendsResponse {
  setInbox({ ...inbox, friendRequests: res.incoming.length });
  return res;
}

/** Call with a friends list the page loaded itself. */
export const noteFriends = (res: FriendsResponse) => void seen(res);

export async function refreshInbox(): Promise<void> {
  if (getAccount().status !== "signedIn") return setInbox(EMPTY);
  try {
    setInbox(await api<InboxResponse>("/api/social/inbox"));
  } catch {
    // Keep the last counts; the next sync tries again.
  }
}

onAccountChange(() => getAccount().status !== "signedIn" && setInbox(EMPTY));

export function useInbox(): InboxResponse {
  const [s, setS] = useState(inbox);
  useEffect(() => {
    const on = () => setS(inbox);
    events.addEventListener("change", on);
    on();
    return () => events.removeEventListener("change", on);
  }, []);
  return s;
}
