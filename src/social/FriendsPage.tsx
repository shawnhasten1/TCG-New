// #/friends: your friend code, adding friends by code (or an invite link, #/friends/<code>), requests and your friends.

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { isMember, useAccount } from "../account/account";
import { href } from "../app/router";
import { Avatar, day, SocialTabs } from "./common";
import { acceptFriend, loadFriends, noteFriends, removeFriend, sendFriendRequest, setDisplayName } from "./friends";
import { formatFriendCode, NAME_MAX, normalizeFriendCode, type FriendEntry, type FriendsResponse } from "./protocol";
import "../collection/collection.css";
import "./social.css";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function FriendsPage({ inviteCode }: { inviteCode?: string }) {
  const account = useAccount();
  const signedIn = isMember(account);
  const [data, setData] = useState<FriendsResponse>();
  const [loadError, setLoadError] = useState<string>();

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    const load = () =>
      loadFriends().then(
        (d) => live && (setData(d), setLoadError(undefined), noteFriends(d)),
        (err) => live && setLoadError(message(err)),
      );
    void load();
    // Pick up requests that arrived while the page was in the background.
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [signedIn, account.user?.id]);

  return (
    <main className="collection friends">
      <nav className="crumbs">
        <a href={href.open()}>← Open packs</a>
        <a href={href.collection()}>Your collection</a>
      </nav>
      <h1>Friends</h1>
      {signedIn && <SocialTabs current="friends" />}
      {!signedIn ? (
        <p className="muted empty">
          {inviteCode ? "Someone invited you to be friends. " : ""}Friends need an account. <a href={href.settings()}>Sign up or sign in</a>
          {inviteCode ? ", then open the invite link again." : "."}
        </p>
      ) : loadError && !data ? (
        <p className="error" role="alert">
          {loadError}
        </p>
      ) : !data ? (
        <p className="muted" role="status">
          Loading…
        </p>
      ) : !data.me.displayName ? (
        <NameForm suggested={account.user?.name ?? ""} onSaved={setData} intro />
      ) : (
        <Friends data={data} onChange={setData} inviteCode={inviteCode} />
      )}
    </main>
  );
}

function NameForm({ suggested, onSaved, onCancel, intro }: { suggested: string; onSaved: (d: FriendsResponse) => void; onCancel?: () => void; intro?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      onSaved(await setDisplayName(String(new FormData(e.currentTarget).get("name") ?? "")));
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="friends-card">
      {intro && (
        <>
          <h2>Pick a name</h2>
          <p className="muted">This is what your friends see. Your email stays private.</p>
        </>
      )}
      <form className="inline-form" onSubmit={submit}>
        <label className="sr-only" htmlFor="display-name">
          Display name
        </label>
        <input id="display-name" name="name" defaultValue={suggested.slice(0, NAME_MAX)} maxLength={NAME_MAX} autoComplete="nickname" required autoFocus />
        <button type="submit" className="primary" disabled={busy}>
          Save
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function Friends({ data, onChange, inviteCode }: { data: FriendsResponse; onChange: (d: FriendsResponse) => void; inviteCode?: string }) {
  const [editingName, setEditingName] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string }>();

  /** Runs one change, keyed so only its own button shows as busy. */
  const run = async (key: string, fn: () => Promise<FriendsResponse>, ok?: (d: FriendsResponse) => string) => {
    setBusy(key);
    setStatus(undefined);
    try {
      const d = await fn();
      onChange(d);
      if (ok) setStatus({ kind: "ok", text: ok(d) });
      return true;
    } catch (err) {
      setStatus({ kind: "error", text: message(err) });
      return false;
    } finally {
      setBusy(undefined);
    }
  };

  const addFriend = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const code = String(new FormData(form).get("code") ?? "");
    const before = new Set(data.friends.map((f) => f.id));
    const sent = await run("add", () => sendFriendRequest(code), (d) => {
      // They'd already asked, so this made you friends straight away.
      const added = d.friends.find((f) => !before.has(f.id));
      return added ? `You and ${added.displayName} are now friends.` : "Request sent. You'll be friends once they accept.";
    });
    if (sent) {
      form.reset();
      // Done with the invite link, so a reload doesn't send it again.
      if (inviteCode) history.replaceState(null, "", href.friends());
    }
  };

  const decline = (f: FriendEntry, what: "decline" | "cancel" | "remove") => {
    if (what === "remove" && !confirm(`Remove ${f.displayName} from your friends?`)) return;
    void run(`${what}:${f.id}`, () => removeFriend(f.id));
  };

  const ownInvite = inviteCode && normalizeFriendCode(inviteCode) === data.me.friendCode;

  return (
    <>
      <section className="friends-card code-card">
        <h2>Your friend code</h2>
        <CodeShare code={data.me.friendCode} />
        {editingName ? (
          <NameForm suggested={data.me.displayName ?? ""} onSaved={(d) => (onChange(d), setEditingName(false))} onCancel={() => setEditingName(false)} />
        ) : (
          <p className="muted">
            Friends see you as <strong className="ink">{data.me.displayName}</strong>.{" "}
            <button type="button" className="link" onClick={() => setEditingName(true)}>
              Change
            </button>
          </p>
        )}
      </section>

      <section className="friends-card">
        <h2>Add a friend</h2>
        {ownInvite && <p className="muted">That's your own invite link. Send it to a friend so they can add you.</p>}
        <form className="inline-form" onSubmit={addFriend}>
          <label className="sr-only" htmlFor="friend-code">
            Friend code
          </label>
          <input
            id="friend-code"
            name="code"
            className="code-input"
            placeholder="K7QX-3M9P"
            defaultValue={inviteCode && !ownInvite ? inviteCode : ""}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={12}
            required
            autoFocus={!!inviteCode && !ownInvite}
          />
          <button type="submit" className="primary" disabled={busy === "add"}>
            Send request
          </button>
        </form>
        {status && (
          <p className={status.kind} role={status.kind === "error" ? "alert" : "status"}>
            {status.text}
          </p>
        )}
      </section>

      {data.incoming.length > 0 && (
        <section>
          <h3>Requests for you</h3>
          <ul className="friend-list">
            {data.incoming.map((f) => (
              <FriendRow key={f.id} friend={f} note={`Asked ${day(f.since)}`}>
                <button type="button" className="primary" disabled={!!busy} onClick={() => void run(`accept:${f.id}`, () => acceptFriend(f.id))}>
                  Accept
                </button>
                <button type="button" disabled={!!busy} onClick={() => decline(f, "decline")}>
                  Decline
                </button>
              </FriendRow>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3>Your friends</h3>
        {data.friends.length === 0 ? (
          <p className="muted">No friends yet. Share your code, or add someone else's.</p>
        ) : (
          <ul className="friend-list">
            {data.friends.map((f) => (
              <FriendRow key={f.id} friend={f} note={`Friends since ${day(f.since)}`}>
                <a className="button" href={href.friend(f.id)}>
                  Collection
                </a>
                <button type="button" className="danger" disabled={!!busy} onClick={() => decline(f, "remove")}>
                  Remove
                </button>
              </FriendRow>
            ))}
          </ul>
        )}
      </section>

      {data.outgoing.length > 0 && (
        <section>
          <h3>Waiting for them</h3>
          <ul className="friend-list">
            {data.outgoing.map((f) => (
              <FriendRow key={f.id} friend={f} note={`Sent ${day(f.since)}`}>
                <button type="button" disabled={!!busy} onClick={() => decline(f, "cancel")}>
                  Cancel
                </button>
              </FriendRow>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function CodeShare({ code }: { code: string }) {
  const [copied, setCopied] = useState<"code" | "link">();
  const link = `${location.origin}/${href.friends(code)}`;

  const copy = async (what: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(what === "code" ? formatFriendCode(code) : link);
      setCopied(what);
      setTimeout(() => setCopied(undefined), 2000);
    } catch {
      // No clipboard access; the code is on screen to copy by hand.
    }
  };

  const invite = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Add me on Pack Opener", text: `Add me as a friend on Pack Opener. My code is ${formatFriendCode(code)}.`, url: link });
      } catch {
        // Closed the share sheet.
      }
    } else await copy("link");
  };

  return (
    <>
      <p className="friend-code" aria-label={`Friend code ${[...code].join(" ")}`}>
        {formatFriendCode(code)}
      </p>
      <div className="row">
        <button type="button" onClick={() => void copy("code")}>
          {copied === "code" ? "Copied" : "Copy code"}
        </button>
        <button type="button" onClick={() => void invite()}>
          {copied === "link" ? "Link copied" : "Share invite link"}
        </button>
      </div>
    </>
  );
}

function FriendRow({ friend, note, children }: { friend: FriendEntry; note: string; children: ReactNode }) {
  return (
    <li>
      <Avatar friend={friend} />
      <div className="who-text">
        <strong>{friend.displayName}</strong>
        <span className="muted">{note}</span>
      </div>
      <div className="actions">{children}</div>
    </li>
  );
}
