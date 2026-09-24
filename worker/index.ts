// The app's Worker. The built app is served as static assets; only /api/* reaches this code
// (see run_worker_first in wrangler.jsonc).

import { handleAuth } from "./auth";
import { handleCollection } from "./collection";
import { handleFriends } from "./friends";
import { handlePacks } from "./packs";
import { HttpError, json, type Ctx } from "./http";

async function route(ctx: Ctx): Promise<Response> {
  const { pathname } = ctx.url;
  // Cookies are SameSite=Lax, and anything that changes state must also come from this site's own pages.
  if (ctx.req.method !== "GET" && ctx.req.method !== "HEAD" && ctx.req.headers.get("Origin") !== ctx.url.origin) throw new HttpError(403, "Cross-site request refused");
  if (pathname.startsWith("/api/auth/")) return handleAuth(ctx);
  if (pathname === "/api/collection") return handleCollection(ctx);
  if (pathname.startsWith("/api/packs/")) return handlePacks(ctx);
  if (pathname === "/api/friends" || pathname.startsWith("/api/friends/") || pathname === "/api/social/inbox") return handleFriends(ctx);
  throw new HttpError(404, "Not found");
}

export default {
  async fetch(req, env) {
    const ctx: Ctx = { req, env, url: new URL(req.url), setCookies: [] };
    let res: Response;
    try {
      res = await route(ctx);
    } catch (err) {
      if (!(err instanceof HttpError)) console.error(err);
      res = err instanceof HttpError ? json({ error: err.message }, err.status) : json({ error: "Something went wrong on our end." }, 500);
    }
    for (const c of ctx.setCookies) res.headers.append("Set-Cookie", c);
    return res;
  },
} satisfies ExportedHandler<Env>;
