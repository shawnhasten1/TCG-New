// Friends, shared by the app and the Worker (worker/friends.ts).

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

/** Counts behind the badge in the top bar. Trades and the feed will add to this. */
export interface InboxResponse {
  friendRequests: number;
}
