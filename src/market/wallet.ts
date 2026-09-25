// Coins from the Worker's /api/wallet. Signed-up players only.

import { api } from "../account/account";
import type { WalletResponse } from "./protocol";

export const loadWallet = () => api<WalletResponse>("/api/wallet");
