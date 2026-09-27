// Coins: each player's balance per game (wallets) and its history (wallet_ledger), and what the market counts cards as.
// Coins belong to one game and are never shared: selling Magic cards can't pay for Pokémon packs.
//
// Every change to a balance goes through walletStatements, which updates it and logs it together, so the history
// always adds up. They're statements rather than a call, to go in the same batch (one transaction) as whatever the
// coins are for. Spending more than the balance fails its CHECK and rolls the whole batch back (isOverdrawn).

import type { CardPricing } from "../src/api/tcgdex";
import { priceFor } from "../src/collection/prices";
import { coinValue, WELCOME_COINS, type CoinValue, type LedgerEntry, type LedgerKind, type WalletResponse } from "../src/market/protocol";
import type { Game } from "../src/game";
import type { TradeCard } from "../src/social/protocol";
import { cardPricing } from "./cards";
import { HttpError, json, type Ctx } from "./http";
import { requireMember, type UserRow } from "./session";

/** Entries shown in the history. */
const HISTORY = 50;
/** Price lookups in flight at once. Each is a request to the card database unless it's already cached today. */
const PRICE_CONCURRENCY = 6;

/** The wallet is Pokémon's only, for now. */
const GAME: Game = "pokemon";

export async function handleWallet(ctx: Ctx): Promise<Response> {
  const user = await requireMember(ctx);
  await welcome(ctx.env.DB, user, GAME);
  if (ctx.req.method === "GET" && ctx.url.pathname === "/api/wallet") return json(await wallet(ctx, user, GAME));
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

/** A player's balance in one game. */
export async function balance(db: D1Database, userId: string, game: Game): Promise<number> {
  return (await db.prepare("SELECT coins FROM wallets WHERE user_id = ? AND game = ?").bind(userId, game).first<{ coins: number }>())?.coins ?? 0;
}

export async function wallet(ctx: Ctx, user: UserRow, game: Game): Promise<WalletResponse> {
  const db = ctx.env.DB;
  const [coins, history] = await Promise.all([
    balance(db, user.id, game),
    db
      .prepare("SELECT id, kind, amount, balance, note, created_at FROM wallet_ledger WHERE user_id = ? AND game = ? ORDER BY created_at DESC, rowid DESC LIMIT ?")
      .bind(user.id, game, HISTORY)
      .all<LedgerRow>(),
  ]);
  return {
    coins,
    history: history.results.map((r): LedgerEntry => ({ id: r.id, kind: r.kind, amount: r.amount, balance: r.balance, note: r.note, at: r.created_at })),
  };
}

/** Makes sure a player has a wallet in a game, so the statements that change it have a row to change. */
const openWallet = (db: D1Database, userId: string, game: Game) => db.prepare("INSERT INTO wallets (user_id, game) VALUES (?, ?) ON CONFLICT DO NOTHING").bind(userId, game);

/**
 * Gives a member a game's welcome coins if they haven't had them: on their first visit to that game's market, whenever
 * their account was made. The statements share the same condition in one transaction, and the history row's id is
 * fixed per player and game, so it can only ever happen once.
 */
export async function welcome(db: D1Database, user: UserRow, game: Game): Promise<void> {
  if (user.guest) return;
  const row = await db.prepare("SELECT welcomed FROM wallets WHERE user_id = ? AND game = ?").bind(user.id, game).first<{ welcomed: number }>();
  if (row?.welcomed) return;
  // Pokémon's keeps the id it had before games, so nobody's welcomed twice.
  const id = game === "pokemon" ? `welcome-${user.id}` : `welcome-${game}-${user.id}`;
  await db.batch([
    openWallet(db, user.id, game),
    db
      .prepare(
        `INSERT INTO wallet_ledger (id, user_id, game, kind, amount, balance, ref, note, created_at)
         SELECT ?1, user_id, game, 'grant', ?2, coins + ?2, 'welcome', 'Welcome coins', ?3 FROM wallets WHERE user_id = ?4 AND game = ?5 AND welcomed = 0
         ON CONFLICT (id) DO NOTHING`,
      )
      .bind(id, WELCOME_COINS, Date.now(), user.id, game),
    db.prepare("UPDATE wallets SET coins = coins + ?, welcomed = 1 WHERE user_id = ? AND game = ? AND welcomed = 0").bind(WELCOME_COINS, user.id, game),
  ]);
}

export interface WalletChange {
  kind: LedgerKind;
  /** Coins in (positive) or out (negative). */
  amount: number;
  ref: string | null;
  note: string;
}

/** Statements that change a balance in one game and log it. Batch them with whatever the coins are for. */
export function walletStatements(db: D1Database, userId: string, game: Game, change: WalletChange): D1PreparedStatement[] {
  if (!Number.isSafeInteger(change.amount) || change.amount === 0) throw new Error(`Bad coin amount: ${change.amount}`);
  return [
    openWallet(db, userId, game),
    db.prepare("UPDATE wallets SET coins = coins + ? WHERE user_id = ? AND game = ?").bind(change.amount, userId, game),
    // The balance after is read back from the row just updated.
    db
      .prepare("INSERT INTO wallet_ledger (id, user_id, game, kind, amount, balance, ref, note, created_at) SELECT ?, user_id, game, ?, ?, coins, ?, ?, ? FROM wallets WHERE user_id = ? AND game = ?")
      .bind(crypto.randomUUID(), change.kind, change.amount, change.ref, change.note, Date.now(), userId, game),
  ];
}

/** Whether a batch failed because a spend would have taken a balance below zero. */
export const isOverdrawn = (err: unknown) => /CHECK constraint failed: coins >= 0/.test(String(err));

/** What the market counts each card as, in the finish it was pulled in, from today's prices. */
export async function valueCards(ctx: Ctx, game: Game, cards: Pick<TradeCard, "card" | "set" | "finish" | "firstEdition">[]): Promise<CoinValue[]> {
  const setOf = new Map(cards.map((c) => [c.card.id, c.set.id]));
  const ids = [...setOf.keys()];
  const pricing = new Map<string, CardPricing | null>();
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(PRICE_CONCURRENCY, ids.length) }, async () => {
      while (next < ids.length) {
        const id = ids[next++];
        try {
          pricing.set(id, await cardPricing(ctx, game, setOf.get(id)!, id));
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
