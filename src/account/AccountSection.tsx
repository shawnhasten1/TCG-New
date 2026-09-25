// Settings → Account: sign in (Google or email and password), or see sync status and manage the account.

import { useEffect, useState, type FormEvent } from "react";
import { outboxSize } from "../collection/store";
import { signOut, syncNow, useSyncStatus } from "../sync/sync";
import { changePassword, GOOGLE_SIGN_IN, isMember, register, signIn, useAccount } from "./account";
import { ask } from "../app/Confirm";

const MIN_PASSWORD = 8;

/** An error handed back from Google sign-in (?auth_error=...), shown once and tidied out of the address. */
function takeRedirectError(): string | undefined {
  const params = new URLSearchParams(location.search);
  const error = params.get("auth_error") ?? undefined;
  if (error) {
    params.delete("auth_error");
    const q = params.toString();
    history.replaceState(null, "", `${location.pathname}${q ? `?${q}` : ""}${location.hash}`);
  }
  return error;
}

function ago(d: Date): string {
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

const GoogleLogo = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true" className="google-logo">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17z" />
    <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.5 0 20.1 0 24s1 7.5 2.7 10.7l7.8-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
  </svg>
);

export function AccountSection() {
  const account = useAccount();
  const [error, setError] = useState(takeRedirectError);

  return (
    <section className="account">
      <h2>Account</h2>
      {isMember(account) ? <SignedIn onError={setError} /> : <SignedOut google={account.google} onError={setError} />}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function SignedOut({ google, onError }: { google: boolean; onError: (e?: string) => void }) {
  const [mode, setMode] = useState<"signIn" | "register">("signIn");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "");
    const password = String(f.get("password") ?? "");
    if (mode === "register" && password !== f.get("confirm")) return onError("Those passwords don't match.");
    setBusy(true);
    onError(undefined);
    try {
      if (mode === "register") await register(email, password, String(f.get("name") ?? ""));
      else await signIn(email, password);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="muted">Sign up or sign in to keep your collection on every device you play on, and to add friends. Packs you've opened as a guest come with you.</p>
      {google && (
        <>
          <div className="row">
            <a className="button google" href={GOOGLE_SIGN_IN}>
              <GoogleLogo /> Continue with Google
            </a>
          </div>
          <p className="muted or">or use your email</p>
        </>
      )}
      <form className="auth-form" onSubmit={submit}>
        {mode === "register" && (
          <label>
            Name <span className="muted">(optional)</span>
            <input name="name" autoComplete="nickname" maxLength={60} />
          </label>
        )}
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={mode === "register" ? MIN_PASSWORD : undefined} required />
        </label>
        {mode === "register" && (
          <label>
            Confirm password
            <input name="confirm" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} required />
          </label>
        )}
        <div className="row">
          <button type="submit" className="primary" disabled={busy}>
            {mode === "register" ? "Create account" : "Sign in"}
          </button>
          <button type="button" className="link" onClick={() => (setMode(mode === "register" ? "signIn" : "register"), onError(undefined))}>
            {mode === "register" ? "I already have an account" : "Create an account"}
          </button>
        </div>
      </form>
    </>
  );
}

function SignedIn({ onError }: { onError: (e?: string) => void }) {
  const { user, google } = useAccount();
  const sync = useSyncStatus();
  const [busy, setBusy] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [message, setMessage] = useState<string>();
  // Re-render now and then so "2 min ago" stays true.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!user) return null;

  const statusText =
    sync.state === "syncing"
      ? "Syncing…"
      : sync.state === "offline"
        ? `Offline${sync.pending ? ` · ${sync.pending} change${sync.pending === 1 ? "" : "s"} will sync when you're back` : ""}`
        : sync.state === "error"
          ? `Couldn't sync: ${sync.error}`
          : sync.pending
            ? `${sync.pending} change${sync.pending === 1 ? "" : "s"} waiting to sync`
            : sync.lastSynced
              ? `Synced ${ago(sync.lastSynced)}`
              : "Synced";

  const doSignOut = async () => {
    setBusy(true);
    onError(undefined);
    try {
      await syncNow();
      if (
        (await outboxSize()) &&
        !(await ask({ title: "Sign out anyway?", body: "Some changes on this device haven't reached your account yet, and signing out removes them from this device.", confirm: "Sign out", danger: true }))
      )
        return;
      await signOut();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("confirm")) return onError("Those passwords don't match.");
    setBusy(true);
    onError(undefined);
    try {
      await changePassword(String(f.get("current") ?? ""), String(f.get("password")));
      setEditingPassword(false);
      setMessage("Password saved. Other devices will need to sign in again.");
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="who">
        {user.avatarUrl && <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" />}
        <div>
          <strong>{user.name ?? user.email ?? ""}</strong>
          {user.name && <div className="muted">{user.email}</div>}
        </div>
      </div>
      <p className={sync.state === "error" ? "error" : "muted"} role="status">
        {statusText}
      </p>
      <div className="row">
        <button type="button" onClick={() => void syncNow()} disabled={sync.state === "syncing"}>
          Sync now
        </button>
        <button type="button" onClick={() => (setEditingPassword(!editingPassword), setMessage(undefined))} aria-expanded={editingPassword}>
          {user.hasPassword ? "Change password" : "Add a password"}
        </button>
        {google && !user.hasGoogle && (
          <a className="button google" href={GOOGLE_SIGN_IN}>
            <GoogleLogo /> Connect Google
          </a>
        )}
        <button type="button" onClick={doSignOut} disabled={busy}>
          Sign out
        </button>
      </div>
      {editingPassword && (
        <form className="auth-form" onSubmit={savePassword}>
          {/* Lets password managers file the new password under the right account. */}
          <input type="email" name="username" autoComplete="username" value={user.email ?? ""} readOnly hidden />
          {user.hasPassword && (
            <label>
              Current password
              <input name="current" type="password" autoComplete="current-password" required />
            </label>
          )}
          <label>
            New password
            <input name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} required />
          </label>
          <label>
            Confirm new password
            <input name="confirm" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} required />
          </label>
          <div className="row">
            <button type="submit" className="primary" disabled={busy}>
              Save password
            </button>
          </div>
        </form>
      )}
      {message && <p className="ok">{message}</p>}
    </>
  );
}
