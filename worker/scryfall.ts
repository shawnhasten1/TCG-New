// Scryfall's API from the Worker, politely. Scryfall asks for about 10 requests a second at most, answers bursts with
// 429s and a Retry-After, and asking again during one only makes it longer. So an isolate's requests go one at a time,
// GAP_MS apart, and after a 429 every isolate stops asking until the Retry-After is up (kept in D1), failing fast
// instead. Card data and prices are cached in D1 (worker/mtg.ts), so Scryfall is only asked for what's missing.
// Card images (cards.scryfall.io) and set symbols (svgs.scryfall.io) aren't rate limited and don't go through here.

import type { Fetcher } from "../src/mtg/cards";

const GAP_MS = 150;
/** How long to stop asking after a 429 without a Retry-After. */
const DEFAULT_COOL_S = 30;
const COOL_KEY = "scryfall:cooldown";

let last = 0;
let queue: Promise<void> = Promise.resolve();
/** Until when this isolate knows to leave Scryfall be. */
let coolUntil = 0;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waits for this isolate's turn: after the requests before it, and GAP_MS after the last one. */
function turn(): Promise<void> {
  const mine = queue.then(async () => {
    const gap = last + GAP_MS - Date.now();
    if (gap > 0) await wait(gap);
    last = Date.now();
  });
  queue = mine.catch(() => undefined);
  return mine;
}

/** A fetch for Scryfall's API that keeps to its limits. Throws, without asking, while Scryfall wants us to wait. */
export function scryfall(env: Env): Fetcher {
  return async (url, init) => {
    if (Date.now() < coolUntil) throw new Error("429: Scryfall asked us to wait");
    const stored = await env.DB.prepare("SELECT value FROM api_cache WHERE key = ?").bind(COOL_KEY).first<{ value: string }>();
    coolUntil = Math.max(coolUntil, stored ? Number(JSON.parse(stored.value)) : 0);
    if (Date.now() < coolUntil) throw new Error("429: Scryfall asked us to wait");

    await turn();
    const res = await fetch(url, init);
    if (res.status === 429) {
      const seconds = Number(res.headers.get("Retry-After")) || DEFAULT_COOL_S;
      coolUntil = Date.now() + seconds * 1000;
      console.warn(`Scryfall asked us to wait ${seconds} s`);
      await env.DB.prepare("INSERT OR REPLACE INTO api_cache (key, value, updated_at) VALUES (?, ?, ?)").bind(COOL_KEY, JSON.stringify(coolUntil), Date.now()).run();
    }
    return res;
  };
}
