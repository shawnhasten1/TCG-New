// Where the collection pages get their cards: your own collection (IndexedDB), or a friend's, fetched from the
// server and read-only. The same "By set", binder, "By rarity" and "All cards" pages show either.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../account/account";
import { href } from "../app/router";
import type { FriendCollection, FriendProfile } from "../social/protocol";
import { parseCardUid } from "../sync/protocol";
import { getPulls, onCollectionChange, type PullRecord } from "./store";

export interface CollectionSource {
  /** Whose collection this is: a friend's, or undefined for your own (which you can change). */
  owner?: FriendProfile;
  getPulls(setId?: string): Promise<PullRecord[]>;
  /** Calls `fn` when the collection changes. Returns an unsubscribe function. */
  onChange(fn: () => void): () => void;
  links: { collection(): string; binder(setId: string): string; cards(): string; all(): string };
}

const own: CollectionSource = {
  getPulls,
  onChange: onCollectionChange,
  links: { collection: href.collection, binder: href.binder, cards: href.cards, all: href.all },
};

const Source = createContext<CollectionSource>(own);

export const useCollectionSource = () => useContext(Source);

/** A friend's cards as pull records, so the collection pages can show them. */
export function friendPulls(res: FriendCollection): PullRecord[] {
  return res.cards.flatMap((c) => {
    const id = parseCardUid(c.uid);
    return id ? [{ packId: id.packId, slot: id.slot, setId: c.setId, cardId: c.cardId, localId: c.localId, finish: c.finish, firstEdition: c.firstEdition, openedAt: c.openedAt }] : [];
  });
}

/** Fetched collections, kept briefly so moving between a friend's pages doesn't fetch again each time. */
const recent = new Map<string, { at: number; res: Promise<FriendCollection> }>();
const KEEP_MS = 60_000;

/** A friend's collection; `fresh` skips the brief cache (for trading, where it must be current). */
export function fetchFriend(friendId: string, fresh = false): Promise<FriendCollection> {
  const hit = recent.get(friendId);
  if (!fresh && hit && Date.now() - hit.at < KEEP_MS) return hit.res;
  const res = api<FriendCollection>(`/api/friends/${friendId}/collection`);
  recent.set(friendId, { at: Date.now(), res });
  res.catch(() => recent.delete(friendId));
  return res;
}

/** Shows `children` over a friend's collection instead of your own. */
export function FriendCollectionProvider({ friendId, children }: { friendId: string; children: ReactNode }) {
  const [source, setSource] = useState<CollectionSource>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let live = true;
    fetchFriend(friendId).then(
      (res) => {
        if (!live) return;
        const pulls = friendPulls(res);
        setSource({
          owner: res.owner,
          getPulls: async (setId) => (setId ? pulls.filter((p) => p.setId === setId) : pulls),
          onChange: () => () => undefined,
          links: { collection: () => href.friend(friendId), binder: (setId) => href.friend(friendId, setId), cards: () => href.friendCards(friendId), all: () => href.friendAll(friendId) },
        });
      },
      (err) => live && setError(err instanceof Error ? err.message : String(err)),
    );
    return () => {
      live = false;
    };
  }, [friendId]);

  if (error || !source) {
    return (
      <main className="collection">
        <nav className="crumbs">
          <a href={href.friends()}>← Friends</a>
        </nav>
        <p className={error ? "error" : "muted"} role={error ? "alert" : "status"}>
          {error ?? "Loading their collection…"}
        </p>
      </main>
    );
  }
  return <Source.Provider value={source}>{children}</Source.Provider>;
}

/** "Your" or "Ash's", for headings. */
export const whose = (s: CollectionSource) => (s.owner ? `${s.owner.displayName}'s` : "Your");
