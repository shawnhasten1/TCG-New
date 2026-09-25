// #/feed: cards you and your friends shared from packs, newest first. Tap a card for a closer look; react and comment
// under each post.

import { useCallback, useEffect, useState } from "react";
import { cardImage } from "../api/tcgdex";
import { isMember, useAccount } from "../account/account";
import { href } from "../app/router";
import { CardDetail } from "../collection/CardDetail";
import { ownership, type Ownership } from "../collection/progress";
import { getPulls, onCollectionChange } from "../collection/store";
import { pullTier } from "../engine/tiers";
import { layoutFor } from "../foil/layouts";
import { Avatar, ago, SocialTabs } from "./common";
import { loadFeed, takeDownPost } from "./feed";
import { PostSocial } from "./PostSocial";
import type { FeedPost, SharedCard } from "./protocol";
import { ask } from "../app/Confirm";
import { formatCoins } from "../market/protocol";
import "../collection/collection.css";
import "./social.css";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function FeedPage() {
  const account = useAccount();
  const member = isMember(account);
  const [posts, setPosts] = useState<FeedPost[]>();
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [owned, setOwned] = useState<Map<string, Ownership>>();
  const [selected, setSelected] = useState<{ post: FeedPost; shared: SharedCard }>();

  const refresh = useCallback(async () => {
    try {
      const res = await loadFeed();
      setPosts(res.posts);
      setCursor(res.cursor);
      setError(undefined);
    } catch (err) {
      setError(message(err));
    }
  }, []);

  useEffect(() => {
    if (!member) return;
    void refresh();
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [member, account.user?.id, refresh]);

  // Your own copies, so a closer look at a friend's card says whether you have it.
  useEffect(() => {
    let live = true;
    const reload = () => getPulls().then((p) => live && setOwned(ownership(p)));
    void reload();
    const off = onCollectionChange(reload);
    return () => {
      live = false;
      off();
    };
  }, []);

  const more = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await loadFeed(cursor);
      setPosts((p) => [...(p ?? []), ...res.posts]);
      setCursor(res.cursor);
    } catch (err) {
      setError(message(err));
    } finally {
      setLoadingMore(false);
    }
  };

  const remove = async (post: FeedPost) => {
    if (!(await ask({ title: "Remove this post?", body: "It comes off the feed for you and your friends.", confirm: "Remove", danger: true }))) return;
    try {
      await takeDownPost(post.id);
      setPosts((p) => p?.filter((x) => x.id !== post.id));
    } catch (err) {
      setError(message(err));
    }
  };

  return (
    <main className="collection friends feed">
      <h1>Feed</h1>
      {!member ? (
        <p className="muted empty">
          The feed shows cards you and your friends share from packs. <a href={href.settings()}>Sign up or sign in</a> to join in.
        </p>
      ) : (
        <>
          <SocialTabs current="feed" />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {!posts ? (
            !error && (
              <p className="muted" role="status">
                Loading…
              </p>
            )
          ) : posts.length === 0 ? (
            <p className="muted empty">
              Nothing here yet. Tap <strong>Share</strong> when you pull something good, and <a href={href.friends()}>add friends</a> to see what they pull.
            </p>
          ) : (
            <>
              <ul className="feed-list">
                {posts.map((post) => (
                  <li key={post.id} className="feed-post">
                    <header>
                      <Avatar friend={post.author} />
                      <div className="who-text">
                        <strong>{post.mine ? "You" : <a href={href.friend(post.author.id)}>{post.author.displayName}</a>}</strong>
                        <span className="muted">
                          {post.sale ? "Sold on the market" : post.set.name} · {ago(post.createdAt)}
                        </span>
                      </div>
                      {post.mine && (
                        <button type="button" className="link" onClick={() => void remove(post)}>
                          Remove
                        </button>
                      )}
                    </header>
                    <div className="feed-cards">
                      {post.cards.map((c) => (
                        <figure key={c.slot} data-finish={c.finish} data-tier={pullTier({ card: c.card, finish: c.finish, firstEdition: c.firstEdition, slot: "", outcome: "" })}>
                          <button type="button" aria-label={`Look closer at ${c.card.name}`} onClick={() => setSelected({ post, shared: c })}>
                            <img src={cardImage(c.card, "low")} alt="" loading="lazy" />
                          </button>
                          <figcaption>
                            {c.card.name}
                            {post.sale && (
                              <small className="sale">
                                Sold to {post.sale.to} for {formatCoins(post.sale.coins)}
                              </small>
                            )}
                            <small>
                              {c.card.rarity}
                              {c.finish !== "normal" ? ` · ${c.finish}` : ""}
                              {c.firstEdition ? " · 1st Ed" : ""}
                            </small>
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                    <PostSocial post={post} onChange={(patch) => setPosts((p) => p?.map((x) => (x.id === post.id ? { ...x, ...patch } : x)))} />
                  </li>
                ))}
              </ul>
              {cursor && (
                <div className="row">
                  <button type="button" onClick={() => void more()} disabled={loadingMore}>
                    {loadingMore ? "Loading…" : "Older posts"}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
      {selected && (
        <CardDetail
          card={selected.shared.card}
          official={selected.post.set.official}
          owned={owned?.get(selected.shared.card.id)}
          layout={layoutFor(selected.post.set.serieId)}
          finish={selected.shared.finish}
          onClose={() => setSelected(undefined)}
        />
      )}
    </main>
  );
}
