// The friends feed from the Worker's /api/feed.

import { api } from "../account/account";
import { noteFeedSeen } from "./friends";
import type { FeedResponse, ShareRequest } from "./protocol";

/** The newest posts, or older ones after a cursor. The newest page marks the feed seen. */
export async function loadFeed(before?: string): Promise<FeedResponse> {
  const res = await api<FeedResponse>(`/api/feed${before ? `?before=${encodeURIComponent(before)}` : ""}`);
  if (!before) noteFeedSeen();
  return res;
}

/** Shares cards from a pack to the feed. Returns every slot shared from that pack so far. */
export const shareCards = (packId: string, slots: number[]) => api<{ slots: number[] }>("/api/feed/share", { body: { packId, slots } satisfies ShareRequest }).then((r) => r.slots);

export const takeDownPost = (id: string) => api(`/api/feed/${id}`, { method: "DELETE" });
