// Trades from the Worker's /api/trades.

import { api } from "../account/account";
import { syncNow } from "../sync/sync";
import { noteTrades } from "./friends";
import type { TradeRequest, TradesResponse } from "./protocol";

const seen = (res: TradesResponse) => (noteTrades(res.incoming.length), res);

export const loadTrades = () => api<TradesResponse>("/api/trades").then(seen);
export const proposeTrade = (req: TradeRequest) => api<TradesResponse>("/api/trades", { body: req }).then(seen);
export const declineTrade = (id: string) => api<TradesResponse>(`/api/trades/${id}/decline`, { body: {} }).then(seen);
export const cancelTrade = (id: string) => api<TradesResponse>(`/api/trades/${id}/cancel`, { body: {} }).then(seen);

/** Accepts an offer, then syncs so the cards change hands on this device straight away. */
export async function acceptTrade(id: string): Promise<TradesResponse> {
  const res = seen(await api<TradesResponse>(`/api/trades/${id}/accept`, { body: {} }));
  void syncNow();
  return res;
}
