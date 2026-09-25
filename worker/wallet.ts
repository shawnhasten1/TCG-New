// Coins: each player's balance (users.coins) and its history (wallet_ledger), and what the market counts cards as.
//
// Every change to a balance goes through walletStatements, which updates it and logs it together, so the history
// always adds up. They're statements rather than a call, to go in the same batch (one transaction) as whatever the
// coins are for. Spending more than the balance fails its CHECK and rolls the whole batch back (isOverdrawn).

import type { CardPricing } from "../src/api/tcgdex";
import { priceFor } from "../src/collection/prices";
import { coinValue, WELCOME_COINS, type CoinValue, type LedgerEntry, type LedgerKind, type WalletResponse } from "../src/market/protocol";
import type { TradeCard } from "../src/social/protocol";
import { tcgdex } from "./cache";
import { HttpError, json, type Ctx } from "./http";
import { requireMember, type UserRow } from "./session";

/** Entries shown in the history. */
const HISTORY = 50;
/** Price lookups in flight at once. Each is a TCGdex request unless it's already cached today. */
const PRICE_CONCURRENCY = 6;

export async function handleWallet(ctx: Ctx): Promise<Response> {
  const user = await requireMember(ctx);
  await welcome(ctx.env.DB, user);
  if (ctx.req.method === "GET" && ctx.url.pathname === "/api/wallet") return json(await wallet(ctx, user));
  throw new HttpError(404, "Not found");
}

interface LedgerRow {
  id: string;
  kind: LedgerKind;
  amount: number;
  balance: number;
  note: string;
  created_at: number;
}

export async function wallet(ctx: Ctx, user: UserRow): Promise<WalletResponse> {
  const db = ctx.env.DB;
  const [balance, history] = await Promise.all([
    db.prepare("SELECT coins FROM users WHERE id = ?").bind(user.id).first<{ coins: number }>(),
    db.prepare("SELECT id, kind, amount, balance, note, created_at FROM wallet_ledger WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?").bind(user.id, HISTORY).all<LedgerRow>(),
  ]);
  return {
    coins: balance?.coins ?? 0,
    history: history.results.map((r): LedgerEntry => ({ id: r.id, kind: r.kind, amount: r.amount, balance: r.balance, note: r.note, at: r.created_at })),
  };
}

/**
 * Gives a member their welcome coins if they haven't had them: on their first visit to the market, whenever their
 * account was made. Both statements share the same condition in one transaction, and the history row's id is fixed
 * per player, so it can only ever happen once.
 */
export async function welcome(db: D1Database, user: UserRow): Promise<void> {
  if (user.welcomed || user.guest) return;
  await db.batch([
    db
      .prepare(
        `INSERT INTO wallet_ledger (id, user_id, kind, amount, balance, ref, note, created_at)
         SELECT 'welcome-' || id, id, 'grant', ?1, coins + ?1, 'welcome', 'Welcome coins', ?2 FROM users WHERE id = ?3 AND guest = 0 AND welcomed = 0
         ON CONFLICT (id) DO NOTHING`,
      )
      .bind(WELCOME_COINS, Date.now(), user.id),
    db.prepare("UPDATE users SET coins = coins + ?, welcomed = 1 WHERE id = ? AND guest = 0 AND welcomed = 0").bind(WELCOME_COINS, user.id),
  ]);
  user.welcomed = 1;
}

export interface WalletChange {
  kind: LedgerKind;
  /** Coins in (positive) or out (negative). */
  amount: number;
  ref: string | null;
  note: string;
}

/** Statements that change a balance and log it. Batch them with whatever the coins are for. */
export function walletStatements(db: D1Database, userId: string, change: WalletChange): D1PreparedStatement[] {
  if (!Number.isSafeInteger(change.amount) || change.amount === 0) throw new Error(`Bad coin amount: ${change.amount}`);
  return [
    db.prepare("UPDATE users SET coins = coins + ? WHERE id = ?").bind(change.amount, userId),
    // The balance after is read back from the row just updated.
    db
      .prepare("INSERT INTO wallet_ledger (id, user_id, kind, amount, balance, ref, note, created_at) SELECT ?, id, ?, ?, coins, ?, ?, ? FROM users WHERE id = ?")
      .bind(crypto.randomUUID(), change.kind, change.amount, change.ref, change.note, Date.now(), userId),
  ];
}

/** Whether a batch failed because a spend would have taken a balance below zero. */
export const isOverdrawn = (err: unknown) => /CHECK constraint failed: coins >= 0/.test(String(err));

/** What the market counts each card as, in the finish it was pulled in, from today's prices. */
export async function valueCards(ctx: Ctx, cards: Pick<TradeCard, "card" | "finish" | "firstEdition">[]): Promise<CoinValue[]> {
  const { client } = tcgdex(ctx.env);
  const ids = [...new Set(cards.map((c) => c.card.id))];
  const pricing = new Map<string, CardPricing | null>();
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(PRICE_CONCURRENCY, ids.length) }, async () => {
      while (next < ids.length) {
        const id = ids[next++];
        try {
          pricing.set(id, await client.getCardPricing(id));
        } catch (err) {
          // A card with no price data gets its rarity's stand-in, but one we couldn't look up mustn't: a pricey card
          // would be valued at next to nothing.
          console.error(`Couldn't price ${id}`, err);
          throw new HttpError(503, "Couldn't reach the price database. Try again in a moment.");
        }
      }
    }),
  );
  return cards.map((c) => coinValue(priceFor(pricing.get(c.card.id), c.finish, c.firstEdition), c.card.rarity));
}
