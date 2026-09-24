// Friends and the feed, shared by the app and the Worker (worker/friends.ts, worker/feed.ts).

import type { Card } from "../api/types";
import type { Finish } from "../engine/types";

/** Friend code characters: digits and capitals without 0/O and 1/I, so codes survive being read aloud. 32 of them. */
export const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const CODE_LENGTH = 8;

/** Tidies a typed or pasted code ("k7qx-3m9p", "K7QX 3M9P") to its stored form, or undefined if it can't be one. */
export function normalizeFriendCode(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const code = v.toUpperCase().replace(/[\s-]/g, "");
  return code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c)) ? code : undefined;
}

/** "K7QX3M9P" → "K7QX-3M9P". */
export const formatFriendCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

export const NAME_MIN = 2;
export const NAME_MAX = 24;

/** Tidies a display name, or throws an Error saying what's wrong with it. */
export function parseDisplayName(v: unknown): string {
  // Control and invisible formatting characters out, whitespace runs collapsed.
  const name = typeof v === "string" ? v.replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/g, " ").trim() : "";
  if ([...name].length < NAME_MIN) throw new Error(`Pick a name at least ${NAME_MIN} characters long.`);
  if ([...name].length > NAME_MAX) throw new Error(`Keep your name to ${NAME_MAX} characters.`);
  return name;
}

export interface FriendProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface FriendEntry extends FriendProfile {
  /** When they became friends, or when the request was sent (ms). */
  since: number;
}

export interface FriendsResponse {
  me: { displayName: string | null; friendCode: string };
  friends: FriendEntry[];
  /** Requests waiting for you to accept. */
  incoming: FriendEntry[];
  /** Requests you sent that haven't been answered. */
  outgoing: FriendEntry[];
}

/** Counts behind the badge in the top bar. */
export interface InboxResponse {
  friendRequests: number;
  /** Friends' posts since you last looked at the feed. */
  feedNew: number;
}

/* ---------- Feed ---------- */

/** Most cards one post shows (a whole pack is at most this). */
export const MAX_SHARED = 20;

export interface ShareRequest {
  /** A pack you opened (a dealt pack just torn is opened first). */
  packId: string;
  /** Positions of the cards in the pack, from 0. */
  slots: number[];
}

export interface SharedCard {
  slot: number;
  finish: Finish;
  firstEdition: boolean;
  card: Card;
}

export interface FeedPost {
  id: string;
  author: FriendProfile;
  /** Your own post, which you can take down. */
  mine: boolean;
  set: { id: string; name: string; serieId: string; official: number };
  cards: SharedCard[];
  createdAt: number;
}

export interface FeedResponse {
  posts: FeedPost[];
  /** Pass back as `before` for older posts; null at the end. */
  cursor: string | null;
}

/** Slots from a share request: whole numbers, each once, in order. Throws on anything else. */
export function parseSlots(v: unknown, packSize: number): number[] {
  if (!Array.isArray(v) || !v.length || v.length > MAX_SHARED) throw new Error("Pick the cards to share.");
  const slots = [...new Set(v)].sort((a, b) => a - b);
  if (!slots.every((s) => Number.isInteger(s) && s >= 0 && s < packSize)) throw new Error("Those cards aren't in that pack.");
  return slots;
}
