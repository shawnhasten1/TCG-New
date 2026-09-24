// Small request/response helpers shared by the API routes.

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Per-request state: cookies set along the way are added to whatever response goes out. */
export interface Ctx {
  req: Request;
  env: Env;
  url: URL;
  setCookies: string[];
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

export function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store" } });
}

/** Parses a JSON body, refusing anything that isn't JSON or is unreasonably big. */
export async function readJson<T>(req: Request, maxBytes = 512 * 1024): Promise<T> {
  if (!req.headers.get("Content-Type")?.startsWith("application/json")) throw new HttpError(415, "Expected JSON");
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "Request too large");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}

export function getCookie(req: Request, name: string): string | undefined {
  for (const part of req.headers.get("Cookie")?.split(";") ?? []) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

export function cookie(name: string, value: string, opts: { maxAge: number; path?: string; secure: boolean }): string {
  return [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path ?? "/"}`, `Max-Age=${opts.maxAge}`, "HttpOnly", "SameSite=Lax", ...(opts.secure ? ["Secure"] : [])].join("; ");
}

/** Plain http is only local dev (including a phone on the LAN), where Secure cookies would be dropped. */
export const isSecure = (url: URL) => url.protocol === "https:";

/** Throws 429 once an IP has made too many auth attempts. */
export async function limitAuth(ctx: Ctx, action: string): Promise<void> {
  const ip = ctx.req.headers.get("CF-Connecting-IP") ?? "local";
  const { success } = await ctx.env.AUTH_LIMITER.limit({ key: `${action}:${ip}` });
  if (!success) throw new HttpError(429, "Too many attempts. Wait a minute and try again.");
}

/* ---------- Encoding ---------- */

export function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export const randomToken = (bytes = 32) => base64url(crypto.getRandomValues(new Uint8Array(bytes)));

export async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

export const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
