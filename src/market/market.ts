// The market and coins, from the Worker's /api/market and /api/wallet. Signed-up players only. Each game has its own
// market and coins, so every request says which game this is.

import { api } from "../account/account";
import { GAME } from "../app/game";
import { syncNow } from "../sync/sync";
import { CURRENCY, formatCoins, type KeepRequest, type ListRequest, type MarketResponse, type SellRequest, type SellResponse, type ShareSaleRequest, type WalletResponse } from "./protocol";
import type { DealtPack } from "../packs/protocol";
import type { BuyRequest, BuyResponse, UnopenedResponse } from "./shop";

const at = (path: string) => `${path}?game=${GAME}`;

/** An amount in this game's coins: "1,250 coins" in Pokémon, "1,250 Treasure" in Magic. */
export const coins = (n: number) => formatCoins(n, GAME);
/** What this game's coins are called, for sentences: "coins" or "Treasure". */
export const currency = CURRENCY[GAME].many;
/** Who makes offers: Pokémon trainers, or Magic's buyers (TRAINERS in protocol.ts). */
export const buyers = GAME === "mtg" ? "buyers" : "trainers";

export const loadMarket = () => api<MarketResponse>(at("/api/market"));
export const loadWallet = () => api<WalletResponse>(at("/api/wallet"));
export const listCards = (uids: string[]) => api<MarketResponse>(at("/api/market/list"), { body: { uids } satisfies ListRequest });
export const keepListings = (ids: string[]) => api<MarketResponse>(at("/api/market/keep"), { body: { ids } satisfies KeepRequest });

/** Takes offers, then syncs so the sold cards leave this device straight away. */
export async function sellListings(offers: SellRequest["offers"]): Promise<SellResponse> {
  const res = await api<SellResponse>(at("/api/market/sell"), { body: { offers } satisfies SellRequest });
  if (res.sold) void syncNow();
  return res;
}

export const buyPacks = (setId: string, quantity: number) => api<BuyResponse>(at("/api/market/buy"), { body: { setId, quantity } satisfies BuyRequest });
export const loadUnopened = () => api<UnopenedResponse>(at("/api/market/packs"));
export const loadBoughtPack = (id: string) => api<DealtPack>(at(`/api/market/packs/${encodeURIComponent(id)}`));
/** Posts a sale to the friends feed. Only when the player asks. */
export const shareSale = (id: string) => api<{ ok: true }>(at("/api/market/share"), { body: { id } satisfies ShareSaleRequest });
