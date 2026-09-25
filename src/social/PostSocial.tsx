// Reactions and comments under a feed post. Reactions change on the spot and go back if the server says no.

import { useState, type FormEvent } from "react";
import { ask } from "../app/Confirm";
import { Avatar, ago } from "./common";
import { addComment, deleteComment, loadComments, loadReactors, react } from "./feed";
import { COMMENTS_SHOWN, MAX_COMMENT, REACTIONS, type FeedComment, type FeedPost, type ReactionCounts, type ReactionKind, type ReactorsResponse } from "./protocol";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const emoji = (kind: ReactionKind) => REACTIONS.find((r) => r.kind === kind)?.emoji;

type Patch = Partial<Pick<FeedPost, "reactions" | "myReaction" | "commentCount" | "comments">>;

/** Counts with your reaction moved from `from` to `to`. */
function moveReaction(counts: ReactionCounts, from: ReactionKind | null, to: ReactionKind | null): ReactionCounts {
  const next = { ...counts };
  if (from) next[from] = (next[from] ?? 1) - 1;
  if (to) next[to] = (next[to] ?? 0) + 1;
  for (const r of REACTIONS) if (!next[r.kind]) delete next[r.kind];
  return next;
}

export function PostSocial({ post, onChange }: { post: FeedPost; onChange: (patch: Patch) => void }) {
  const [error, setError] = useState<string>();
  const [reactors, setReactors] = useState<ReactorsResponse["reactors"]>();
  // Every comment, once asked for; until then the post's latest few show.
  const [all, setAll] = useState<FeedComment[]>();
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const total = Object.values(post.reactions).reduce((a, b) => a + (b ?? 0), 0);
  const shown = all ?? post.comments;

  const pick = async (kind: ReactionKind) => {
    const before = { reactions: post.reactions, myReaction: post.myReaction };
    const to = post.myReaction === kind ? null : kind;
    onChange({ reactions: moveReaction(post.reactions, post.myReaction, to), myReaction: to });
    setReactors(undefined);
    setError(undefined);
    try {
      onChange(await react(post.id, to));
    } catch (err) {
      onChange(before);
      setError(message(err));
    }
  };

  const toggleReactors = async () => {
    if (reactors) return setReactors(undefined);
    try {
      setReactors(await loadReactors(post.id));
    } catch (err) {
      setError(message(err));
    }
  };

  const showAll = async () => {
    setLoading(true);
    try {
      const comments = await loadComments(post.id);
      setAll(comments);
      onChange({ commentCount: comments.length });
    } catch (err) {
      setError(message(err));
    } finally {
      setLoading(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || posting) return;
    setPosting(true);
    setError(undefined);
    try {
      const { comment, commentCount } = await addComment(post.id, draft);
      setAll((a) => a && [...a, comment]);
      onChange({ commentCount, comments: [...post.comments, comment].slice(-COMMENTS_SHOWN) });
      setDraft("");
    } catch (err) {
      setError(message(err));
    } finally {
      setPosting(false);
    }
  };

  const remove = async (c: FeedComment) => {
    const body = c.mine ? "It comes off the post for everyone." : `${c.author.displayName}'s comment comes off your post for everyone.`;
    if (!(await ask({ title: "Delete this comment?", body, confirm: "Delete", danger: true }))) return;
    try {
      const commentCount = await deleteComment(post.id, c.id);
      setAll((a) => a?.filter((x) => x.id !== c.id));
      onChange({ commentCount, comments: post.comments.filter((x) => x.id !== c.id) });
    } catch (err) {
      setError(message(err));
    }
  };

  return (
    <div className="post-social">
      <div className="reactions" role="group" aria-label="Reactions">
        {REACTIONS.map((r) => {
          const n = post.reactions[r.kind] ?? 0;
          return (
            <button
              key={r.kind}
              type="button"
              className="reaction"
              aria-pressed={post.myReaction === r.kind}
              aria-label={`${r.label}${n ? `, ${n}` : ""}`}
              title={r.label}
              onClick={() => void pick(r.kind)}
            >
              <span aria-hidden="true">{r.emoji}</span>
              {n > 0 && <span className="n">{n}</span>}
            </button>
          );
        })}
        {total > 0 && (
          <button type="button" className="link who" aria-expanded={!!reactors} onClick={() => void toggleReactors()}>
            {reactors ? "Hide" : "Who reacted"}
          </button>
        )}
      </div>
      {reactors && (
        <ul className="reactors">
          {reactors.map((r) => (
            <li key={r.user.id}>
              <span aria-hidden="true">{emoji(r.kind)}</span> {r.user.displayName}
            </li>
          ))}
        </ul>
      )}

      {!all && post.commentCount > post.comments.length && (
        <button type="button" className="link more-comments" onClick={() => void showAll()} disabled={loading}>
          {loading ? "Loading…" : `View all ${post.commentCount} comments`}
        </button>
      )}
      {shown.length > 0 && (
        <ul className="comments">
          {shown.map((c) => (
            <li key={c.id}>
              <Avatar friend={c.author} />
              <div className="comment-body">
                <p>
                  <strong>{c.mine ? "You" : c.author.displayName}</strong> {c.text}
                </p>
                <span className="muted">
                  {ago(c.createdAt)}
                  {c.canDelete && (
                    <>
                      {" · "}
                      <button type="button" className="link" onClick={() => void remove(c)}>
                        Delete
                      </button>
                    </>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <form className="comment-form" onSubmit={(e) => void submit(e)}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_COMMENT}
          placeholder="Add a comment…"
          aria-label={`Comment on ${post.mine ? "your" : `${post.author.displayName}'s`} post`}
          enterKeyHint="send"
        />
        <button type="submit" disabled={!draft.trim() || posting}>
          {posting ? "Posting…" : "Post"}
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
