// Accounts: email/password sign-up and sign-in, Google sign-in, sign-out, and password changes.
//
// Google and password accounts meet on the email address. Password sign-ups don't prove they own
// their email, so when Google (which does) signs in to an unverified account with the same email,
// the Google owner wins: the account is linked, its password removed and its other sessions ended.
// That stops someone from registering your email first and keeping a way in.
//
// Players who haven't signed up play on a silent guest account (POST /api/auth/guest), since the server opens
// every pack. Signing up as a guest turns that account into a real one; signing in to an existing account
// moves the guest's packs into it and deletes the guest.

import type { MeResponse } from "../src/sync/protocol";
import { base64url, cookie, fromBase64url, getCookie, HttpError, isSecure, json, limitAuth, randomToken, readJson, redirect, sha256, type Ctx } from "./http";
import { dummyVerify, hashPassword, passwordProblem, verifyPassword } from "./password";
import { currentUser, endAllSessions, endSession, publicUser, requireUser, startSession, type UserRow } from "./session";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmail(v: unknown): string {
  const email = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (!EMAIL.test(email) || email.length > 254) throw new HttpError(400, "Enter a valid email address.");
  return email;
}

function parseName(v: unknown): string | null {
  const name = typeof v === "string" ? v.trim().slice(0, 60) : "";
  return name || null;
}

const findByEmail = (ctx: Ctx, email: string) => ctx.env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<UserRow>();

export async function handleAuth(ctx: Ctx): Promise<Response> {
  const route = `${ctx.req.method} ${ctx.url.pathname}`;
  switch (route) {
    case "GET /api/auth/me": {
      const user = await currentUser(ctx);
      return json({ user: user && publicUser(user), google: googleConfigured(ctx.env) } satisfies MeResponse);
    }
    case "POST /api/auth/guest":
      return guest(ctx);
    case "POST /api/auth/register":
      return register(ctx);
    case "POST /api/auth/login":
      return login(ctx);
    case "POST /api/auth/logout":
      await endSession(ctx);
      return json({ ok: true });
    case "POST /api/auth/password":
      return changePassword(ctx);
    case "GET /api/auth/google":
      return googleStart(ctx);
    case "GET /api/auth/google/callback":
      return googleCallback(ctx);
  }
  throw new HttpError(404, "Not found");
}

/* ---------- Guests ---------- */

async function guest(ctx: Ctx): Promise<Response> {
  const existing = await currentUser(ctx);
  if (existing) return json({ user: publicUser(existing) });
  const ip = ctx.req.headers.get("CF-Connecting-IP") ?? "local";
  if (!(await ctx.env.GUEST_LIMITER.limit({ key: ip })).success) throw new HttpError(429, "Too many new players from here. Wait a minute and try again.");

  const id = crypto.randomUUID();
  const user: UserRow = {
    id,
    email: `guest-${id}`,
    email_verified: 0,
    name: null,
    avatar_url: null,
    password_hash: null,
    google_sub: null,
    created_at: Date.now(),
    display_name: null,
    friend_code: null,
    guest: 1,
  };
  await ctx.env.DB.prepare("INSERT INTO users (id, email, email_verified, created_at, guest) VALUES (?, ?, 0, ?, 1)").bind(user.id, user.email, user.created_at).run();
  await startSession(ctx, user.id);
  return json({ user: publicUser(user) });
}

/** The signed-in guest, if this device is playing as one. */
async function currentGuest(ctx: Ctx): Promise<UserRow | null> {
  const user = await currentUser(ctx);
  return user?.guest ? user : null;
}

/** Moves a guest's packs (and its dealt pack, if the account has none waiting) into an account, then deletes the guest. */
async function mergeGuest(ctx: Ctx, guestId: string, intoId: string): Promise<void> {
  const db = ctx.env.DB;
  await db.batch([
    // The subquery is read once per statement, so the moved packs share the account's next seq.
    db.prepare("UPDATE packs SET user_id = ?2, seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM packs WHERE user_id = ?2) WHERE user_id = ?1").bind(guestId, intoId),
    db.prepare("UPDATE OR IGNORE dealt_packs SET user_id = ?2 WHERE user_id = ?1").bind(guestId, intoId),
    // Takes its sessions and any dealt pack left behind with it.
    db.prepare("DELETE FROM users WHERE id = ? AND guest = 1").bind(guestId),
  ]);
}

/* ---------- Email and password ---------- */

async function register(ctx: Ctx): Promise<Response> {
  await limitAuth(ctx, "register");
  const body = await readJson<{ email?: unknown; password?: unknown; name?: unknown }>(ctx.req);
  const email = parseEmail(body.email);
  const problem = passwordProblem(body.password);
  if (problem) throw new HttpError(400, problem);

  const existing = await findByEmail(ctx, email);
  if (existing) throw new HttpError(409, existing.password_hash ? "There's already an account with that email. Sign in instead." : "That email already signs in with Google. Use Continue with Google.");

  // Signing up as a guest keeps the guest's account, and with it every pack opened so far.
  const guest = await currentGuest(ctx);
  if (guest) {
    const upgraded: UserRow = { ...guest, email, name: parseName(body.name), password_hash: await hashPassword(body.password as string), guest: 0 };
    await ctx.env.DB.prepare("UPDATE users SET email = ?, name = ?, password_hash = ?, guest = 0 WHERE id = ? AND guest = 1")
      .bind(upgraded.email, upgraded.name, upgraded.password_hash, guest.id)
      .run();
    await startSession(ctx, guest.id);
    return json({ user: publicUser(upgraded) });
  }

  const user: UserRow = {
    id: crypto.randomUUID(),
    email,
    email_verified: 0,
    name: parseName(body.name),
    avatar_url: null,
    password_hash: await hashPassword(body.password as string),
    google_sub: null,
    created_at: Date.now(),
    display_name: null,
    friend_code: null,
    guest: 0,
  };
  await ctx.env.DB.prepare("INSERT INTO users (id, email, email_verified, name, avatar_url, password_hash, google_sub, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(user.id, user.email, user.email_verified, user.name, user.avatar_url, user.password_hash, user.google_sub, user.created_at)
    .run();
  await startSession(ctx, user.id);
  return json({ user: publicUser(user) });
}

async function login(ctx: Ctx): Promise<Response> {
  await limitAuth(ctx, "login");
  const body = await readJson<{ email?: unknown; password?: unknown }>(ctx.req);
  const email = parseEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";

  const user = await findByEmail(ctx, email);
  if (user && !user.password_hash) throw new HttpError(400, "This account signs in with Google. Use Continue with Google, then you can add a password in Settings.");
  if (!user?.password_hash) {
    await dummyVerify(password);
    throw new HttpError(401, "Wrong email or password.");
  }
  if (!(await verifyPassword(password, user.password_hash))) throw new HttpError(401, "Wrong email or password.");
  const guest = await currentGuest(ctx);
  if (guest) await mergeGuest(ctx, guest.id, user.id);
  await startSession(ctx, user.id);
  return json({ user: publicUser(user) });
}

async function changePassword(ctx: Ctx): Promise<Response> {
  await limitAuth(ctx, "password");
  const user = await requireUser(ctx);
  const body = await readJson<{ current?: unknown; password?: unknown }>(ctx.req);
  if (user.password_hash && !(typeof body.current === "string" && (await verifyPassword(body.current, user.password_hash)))) throw new HttpError(401, "Your current password is wrong.");
  const problem = passwordProblem(body.password);
  if (problem) throw new HttpError(400, problem);

  await ctx.env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .bind(await hashPassword(body.password as string), user.id)
    .run();
  // Sign out everywhere else; keep this device signed in with a fresh session.
  await endAllSessions(ctx, user.id);
  await startSession(ctx, user.id);
  return json({ user: publicUser({ ...user, password_hash: "set" }) });
}

/* ---------- Google (OAuth 2.0 authorization code flow with PKCE) ---------- */

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const OAUTH_COOKIE = "google_oauth";
const OAUTH_PATH = "/api/auth/google";

const googleConfigured = (env: Env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
const callbackUrl = (ctx: Ctx) => `${ctx.url.origin}/api/auth/google/callback`;
/** Back to Settings, with an error for the page to show if something went wrong. */
const backToApp = (ctx: Ctx, error?: string) => redirect(`${ctx.url.origin}/${error ? `?auth_error=${encodeURIComponent(error)}` : ""}#/settings`);

async function googleStart(ctx: Ctx): Promise<Response> {
  if (!googleConfigured(ctx.env)) throw new HttpError(404, "Google sign-in isn't set up.");
  const state = randomToken(16);
  const verifier = randomToken(32);
  ctx.setCookies.push(cookie(OAUTH_COOKIE, `${state}.${verifier}`, { maxAge: 600, path: OAUTH_PATH, secure: isSecure(ctx.url) }));
  const params = new URLSearchParams({
    client_id: ctx.env.GOOGLE_CLIENT_ID!,
    redirect_uri: callbackUrl(ctx),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: base64url(await sha256(verifier)),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return redirect(`${GOOGLE_AUTH}?${params}`);
}

interface GoogleClaims {
  iss: string;
  aud: string;
  exp: number;
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

async function googleCallback(ctx: Ctx): Promise<Response> {
  const [state, verifier] = (getCookie(ctx.req, OAUTH_COOKIE) ?? "").split(".");
  ctx.setCookies.push(cookie(OAUTH_COOKIE, "", { maxAge: 0, path: OAUTH_PATH, secure: isSecure(ctx.url) }));
  const q = ctx.url.searchParams;
  if (q.get("error")) return backToApp(ctx, q.get("error") === "access_denied" ? "Google sign-in was cancelled." : "Google sign-in failed.");
  if (!googleConfigured(ctx.env) || !state || !verifier || q.get("state") !== state || !q.get("code")) return backToApp(ctx, "Google sign-in expired. Try again.");

  // The token comes straight from Google over TLS, so its claims can be trusted without checking the signature.
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: q.get("code")!,
      client_id: ctx.env.GOOGLE_CLIENT_ID!,
      client_secret: ctx.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: callbackUrl(ctx),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  if (!res.ok) {
    console.error("Google token exchange failed", res.status, await res.text());
    return backToApp(ctx, "Google sign-in failed.");
  }
  const { id_token } = await res.json<{ id_token?: string }>();
  const claims = decodeJwt<GoogleClaims>(id_token);
  if (!claims || !["https://accounts.google.com", "accounts.google.com"].includes(claims.iss) || claims.aud !== ctx.env.GOOGLE_CLIENT_ID || claims.exp * 1000 < Date.now()) {
    return backToApp(ctx, "Google sign-in failed.");
  }
  if (!claims.email || !claims.email_verified) return backToApp(ctx, "Your Google account needs a verified email.");

  const email = claims.email.toLowerCase();
  const current = await currentUser(ctx);
  // A guest signing in brings their packs along; a signed-up player is connecting Google to their account.
  const guest = current?.guest ? current : null;
  const signedIn = guest ? null : current;
  const bySub = await ctx.env.DB.prepare("SELECT * FROM users WHERE google_sub = ?").bind(claims.sub).first<UserRow>();

  if (bySub) {
    if (signedIn && signedIn.id !== bySub.id) return backToApp(ctx, "That Google account is already used by another account.");
    if (guest) await mergeGuest(ctx, guest.id, bySub.id);
    await startSession(ctx, bySub.id);
    return backToApp(ctx);
  }

  // Connecting Google from Settings while signed in: attach it to this account, whatever its email.
  if (signedIn) {
    await ctx.env.DB.prepare("UPDATE users SET google_sub = ?, avatar_url = COALESCE(avatar_url, ?), name = COALESCE(name, ?) WHERE id = ?")
      .bind(claims.sub, claims.picture ?? null, claims.name ?? null, signedIn.id)
      .run();
    return backToApp(ctx);
  }

  const byEmail = await findByEmail(ctx, email);
  if (byEmail) {
    const takeover = !byEmail.email_verified;
    await ctx.env.DB.prepare(
      `UPDATE users SET google_sub = ?, email_verified = 1, avatar_url = COALESCE(avatar_url, ?), name = COALESCE(name, ?)${takeover ? ", password_hash = NULL" : ""} WHERE id = ?`,
    )
      .bind(claims.sub, claims.picture ?? null, claims.name ?? null, byEmail.id)
      .run();
    if (takeover) await endAllSessions(ctx, byEmail.id);
    if (guest) await mergeGuest(ctx, guest.id, byEmail.id);
    await startSession(ctx, byEmail.id);
    return backToApp(ctx);
  }

  // A new Google player: a guest's account becomes theirs, packs and all.
  if (guest) {
    await ctx.env.DB.prepare("UPDATE users SET email = ?, email_verified = 1, name = ?, avatar_url = ?, google_sub = ?, guest = 0 WHERE id = ? AND guest = 1")
      .bind(email, claims.name ?? null, claims.picture ?? null, claims.sub, guest.id)
      .run();
    await startSession(ctx, guest.id);
    return backToApp(ctx);
  }

  const id = crypto.randomUUID();
  await ctx.env.DB.prepare("INSERT INTO users (id, email, email_verified, name, avatar_url, password_hash, google_sub, created_at) VALUES (?, ?, 1, ?, ?, NULL, ?, ?)")
    .bind(id, email, claims.name ?? null, claims.picture ?? null, claims.sub, Date.now())
    .run();
  await startSession(ctx, id);
  return backToApp(ctx);
}

function decodeJwt<T>(jwt: string | undefined): T | undefined {
  try {
    const payload = jwt?.split(".")[1];
    return payload ? (JSON.parse(new TextDecoder().decode(fromBase64url(payload))) as T) : undefined;
  } catch {
    return undefined;
  }
}
