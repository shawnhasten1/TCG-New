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
  /** Friends' posts, and reactions and comments on your posts or ones you commented on, since you last looked at the feed. */
  feedNew: number;
  /** Trade offers waiting for you to answer. */
  tradeOffers: number;
}

/** A card someone owns, by its identity (see cardUid in sync/protocol.ts). */
export interface OwnedCard {
  uid: string;
  setId: string;
  cardId: string;
  localId: string;
  finish: Finish;
  firstEdition: boolean;
  /** When its pack was opened (ISO). */
  openedAt: string;
}

/** A friend's collection, to browse (and, later, to pick cards to trade for). */
export interface FriendCollection {
  owner: FriendProfile;
  cards: OwnedCard[];
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
  /** Set when the post is a card sold on the market: what it sold for and to which trainer. */
  sale?: { coins: number; to: string };
  /** How many of each reaction it has; kinds nobody picked are left out. */
  reactions: ReactionCounts;
  myReaction: ReactionKind | null;
  commentCount: number;
  /** The latest few comments, oldest first; the rest load on request. */
  comments: FeedComment[];
}

export interface FeedResponse {
  posts: FeedPost[];
  /** Pass back as `before` for older posts; null at the end. */
  cursor: string | null;
}

/* ---------- Reactions and comments ---------- */

/** The reactions a post can get, in the order they're offered. */
export const REACTIONS = [
  { kind: "like", emoji: "👍", label: "Like" },
  { kind: "dislike", emoji: "👎", label: "Dislike" },
  { kind: "wow", emoji: "😮", label: "Wow" },
  { kind: "laugh", emoji: "😂", label: "Haha" },
] as const;

export type ReactionKind = (typeof REACTIONS)[number]["kind"];
export type ReactionCounts = Partial<Record<ReactionKind, number>>;

export const isReaction = (v: unknown): v is ReactionKind => REACTIONS.some((r) => r.kind === v);

/** Longest comment, in characters. */
export const MAX_COMMENT = 280;
/** Latest comments sent with each post in the feed. */
export const COMMENTS_SHOWN = 2;
/** Most comments one post can collect. */
export const MAX_COMMENTS_PER_POST = 200;

export interface FeedComment {
  id: string;
  author: FriendProfile;
  text: string;
  createdAt: number;
  /** You wrote it. */
  mine: boolean;
  /** You wrote it, or it's on your post. */
  canDelete: boolean;
}

export interface ReactionResponse {
  reactions: ReactionCounts;
  myReaction: ReactionKind | null;
}

/** Who reacted to a post, newest first. */
export interface ReactorsResponse {
  reactors: { user: FriendProfile; kind: ReactionKind }[];
}

export interface CommentsResponse {
  /** Every comment, oldest first. */
  comments: FeedComment[];
}

export interface CommentResponse {
  comment: FeedComment;
  commentCount: number;
}

/** Tidies a comment, or throws an Error saying what's wrong with it. */
export function parseCommentText(v: unknown): string {
  // Control characters and bidi overrides out (zero-width joiners stay, emoji need them), whitespace collapsed.
  const text = typeof v === "string" ? v.replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, " ").replace(/\s+/g, " ").trim() : "";
  if (!text) throw new Error("Write something first.");
  if ([...text].length > MAX_COMMENT) throw new Error(`Keep comments to ${MAX_COMMENT} characters.`);
  return text;
}

/** Slots from a share request: whole numbers, each once, in order. Throws on anything else. */
export function parseSlots(v: unknown, packSize: number): number[] {
  if (!Array.isArray(v) || !v.length || v.length > MAX_SHARED) throw new Error("Pick the cards to share.");
  const slots = [...new Set(v)].sort((a, b) => a - b);
  if (!slots.every((s) => Number.isInteger(s) && s >= 0 && s < packSize)) throw new Error("Those cards aren't in that pack.");
  return slots;
}

/* ---------- Trades ---------- */

/** Most cards either side of a trade can hand over. */
export const MAX_TRADE_CARDS = 10;
/** Most offers one player can have waiting at once. */
export const MAX_OPEN_TRADES = 20;

export type TradeStatus = "pending" | "accepted" | "declined" | "cancelled" | "failed";

/** A card in a trade, with what's needed to show it. */
export interface TradeCard {
  uid: string;
  finish: Finish;
  firstEdition: boolean;
  card: Card;
  set: { id: string; name: string; serieId: string; official: number };
}

export interface Trade {
  id: string;
  from: FriendProfile;
  to: FriendProfile;
  /** You sent it. */
  mine: boolean;
  status: TradeStatus;
  /** What `from` hands over. */
  give: TradeCard[];
  /** What `to` hands over. */
  get: TradeCard[];
  createdAt: number;
  resolvedAt: number | null;
}

export interface TradesResponse {
  /** Offers waiting for your answer. */
  incoming: Trade[];
  /** Offers you sent that haven't been answered. */
  outgoing: Trade[];
  /** Recently finished trades, newest first. */
  history: Trade[];
}

export interface TradeRequest {
  /** The friend the offer goes to. */
  to: string;
  /** Your cards you'd hand over. */
  give: string[];
  /** Their cards you'd like. */
  get: string[];
}

/** Card ids for one side of an offer: each once, each a card id, at most MAX_TRADE_CARDS. Throws on anything else. */
export function parseTradeSide(v: unknown, isUid: (s: unknown) => boolean): string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > MAX_TRADE_CARDS || !v.every(isUid)) throw new Error(`Each side of a trade can have up to ${MAX_TRADE_CARDS} cards.`);
  return [...new Set(v as string[])];
}
