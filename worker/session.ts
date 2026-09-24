// Sign-in sessions: a random token in an HttpOnly cookie, stored hashed in D1.
// Sessions last 30 days and are extended when used, so regular players stay signed in.

import type { PublicUser } from "../src/sync/protocol";
import { cookie, getCookie, hex, HttpError, isSecure, randomToken, sha256, type Ctx } from "./http";

const DAY = 24 * 60 * 60 * 1000;
const LIFETIME = 30 * DAY;
/** Extend once less than this is left, rather than writing on every request. */
const EXTEND_BELOW = 20 * DAY;

export interface UserRow {
  id: string;
  email: string;
  email_verified: number;
  name: string | null;
  avatar_url: string | null;
  password_hash: string | null;
  google_sub: string | null;
  created_at: number;
}

export const publicUser = (u: UserRow): PublicUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  avatarUrl: u.avatar_url,
  hasPassword: !!u.password_hash,
  hasGoogle: !!u.google_sub,
});

// __Host- cookies must be Secure, so plain-http local dev uses a plain name.
const cookieName = (ctx: Ctx) => (isSecure(ctx.url) ? "__Host-session" : "session");
const tokenId = async (token: string) => hex(await sha256(token));

function setSessionCookie(ctx: Ctx, token: string, maxAgeMs: number) {
  ctx.setCookies.push(cookie(cookieName(ctx), token, { maxAge: Math.floor(maxAgeMs / 1000), secure: isSecure(ctx.url) }));
}

export async function startSession(ctx: Ctx, userId: string): Promise<void> {
  const token = randomToken();
  const now = Date.now();
  await ctx.env.DB.batch([
    // Tidy this user's expired sessions while we're here.
    ctx.env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at < ?").bind(userId, now),
    ctx.env.DB.prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").bind(await tokenId(token), userId, now + LIFETIME, now),
  ]);
  setSessionCookie(ctx, token, LIFETIME);
}

export async function endSession(ctx: Ctx): Promise<void> {
  const token = getCookie(ctx.req, cookieName(ctx));
  if (token) await ctx.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(await tokenId(token)).run();
  setSessionCookie(ctx, "", 0);
}

/** The signed-in user, or null. */
export async function currentUser(ctx: Ctx): Promise<UserRow | null> {
  const token = getCookie(ctx.req, cookieName(ctx));
  if (!token) return null;
  const id = await tokenId(token);
  const row = await ctx.env.DB.prepare("SELECT u.*, s.expires_at AS session_expires FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?")
    .bind(id)
    .first<UserRow & { session_expires: number }>();
  const now = Date.now();
  if (!row || row.session_expires < now) {
    if (row) await ctx.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
    setSessionCookie(ctx, "", 0);
    return null;
  }
  if (row.session_expires - now < EXTEND_BELOW) {
    await ctx.env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE id = ?").bind(now + LIFETIME, id).run();
    setSessionCookie(ctx, token, LIFETIME);
  }
  const { session_expires: _, ...user } = row;
  return user;
}

export async function requireUser(ctx: Ctx): Promise<UserRow> {
  const user = await currentUser(ctx);
  if (!user) throw new HttpError(401, "Sign in first.");
  return user;
}

/** Signs out every device, e.g. after the password changes hands. */
export async function endAllSessions(ctx: Ctx, userId: string): Promise<void> {
  await ctx.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
}
