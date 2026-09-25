// The market and coins, from the Worker's /api/market and /api/wallet. Signed-up players only.

import { api } from "../account/account";
import { syncNow } from "../sync/sync";
import type { KeepRequest, ListRequest, MarketResponse, SellRequest, SellResponse, WalletResponse } from "./protocol";
import type { DealtPack } from "../packs/protocol";
import type { BuyRequest, BuyResponse, UnopenedResponse } from "./shop";

export const loadMarket = () => api<MarketResponse>("/api/market");
export const loadWallet = () => api<WalletResponse>("/api/wallet");
export const listCards = (uids: string[]) => api<MarketResponse>("/api/market/list", { body: { uids } satisfies ListRequest });
export const keepListings = (ids: string[]) => api<MarketResponse>("/api/market/keep", { body: { ids } satisfies KeepRequest });

/** Takes offers, then syncs so the sold cards leave this device straight away. */
export async function sellListings(offers: SellRequest["offers"]): Promise<SellResponse> {
  const res = await api<SellResponse>("/api/market/sell", { body: { offers } satisfies SellRequest });
  if (res.sold) void syncNow();
  return res;
}

export const buyPack = (setId: string) => api<BuyResponse>("/api/market/buy", { body: { setId } satisfies BuyRequest });
export const loadUnopened = () => api<UnopenedResponse>("/api/market/packs");
export const loadBoughtPack = (id: string) => api<DealtPack>(`/api/market/packs/${encodeURIComponent(id)}`);
