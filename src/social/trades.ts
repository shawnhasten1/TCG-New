// Trades from the Worker's /api/trades. Cards trade for cards of the same game, so every request says which this is.

import { api } from "../account/account";
import { GAME } from "../app/game";
import { syncNow } from "../sync/sync";
import { noteTrades } from "./friends";
import type { TradeRequest, TradesResponse } from "./protocol";

const seen = (res: TradesResponse) => (noteTrades(res.incoming.length), res);
const at = (path: string) => `${path}?game=${GAME}`;

export const loadTrades = () => api<TradesResponse>(at("/api/trades")).then(seen);
export const proposeTrade = (req: TradeRequest) => api<TradesResponse>(at("/api/trades"), { body: req }).then(seen);
export const declineTrade = (id: string) => api<TradesResponse>(at(`/api/trades/${id}/decline`), { body: {} }).then(seen);
export const cancelTrade = (id: string) => api<TradesResponse>(at(`/api/trades/${id}/cancel`), { body: {} }).then(seen);

/** Accepts an offer, then syncs so the cards change hands on this device straight away. */
export async function acceptTrade(id: string): Promise<TradesResponse> {
  const res = seen(await api<TradesResponse>(at(`/api/trades/${id}/accept`), { body: {} }));
  void syncNow();
  return res;
}
