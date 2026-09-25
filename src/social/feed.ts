// The friends feed from the Worker's /api/feed.

import { api } from "../account/account";
import { noteFeedSeen } from "./friends";
import type { CommentResponse, CommentsResponse, FeedResponse, ReactionKind, ReactionResponse, ReactorsResponse, ShareRequest } from "./protocol";

/** The newest posts, or older ones after a cursor. The newest page marks the feed seen. */
export async function loadFeed(before?: string): Promise<FeedResponse> {
  const res = await api<FeedResponse>(`/api/feed${before ? `?before=${encodeURIComponent(before)}` : ""}`);
  if (!before) noteFeedSeen();
  return res;
}

/** Shares cards from a pack to the feed. Returns every slot shared from that pack so far. */
export const shareCards = (packId: string, slots: number[]) => api<{ slots: number[] }>("/api/feed/share", { body: { packId, slots } satisfies ShareRequest }).then((r) => r.slots);

export const takeDownPost = (id: string) => api(`/api/feed/${id}`, { method: "DELETE" });

/** Sets your reaction to a post, or clears it with null. Returns the post's reactions as they now stand. */
export const react = (postId: string, kind: ReactionKind | null) =>
  api<ReactionResponse>(`/api/feed/${postId}/reaction`, kind ? { method: "PUT", body: { kind } } : { method: "DELETE" });

export const loadReactors = (postId: string) => api<ReactorsResponse>(`/api/feed/${postId}/reactions`).then((r) => r.reactors);

export const loadComments = (postId: string) => api<CommentsResponse>(`/api/feed/${postId}/comments`).then((r) => r.comments);

export const addComment = (postId: string, text: string) => api<CommentResponse>(`/api/feed/${postId}/comments`, { body: { text } });

/** Returns how many comments the post has left. */
export const deleteComment = (postId: string, commentId: string) =>
  api<{ commentCount: number }>(`/api/feed/${postId}/comments/${commentId}`, { method: "DELETE" }).then((r) => r.commentCount);
