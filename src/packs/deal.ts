// Asking the server for a pack (see packs/protocol.ts).

import { api, ApiError } from "../account/account";
import { ensureAccount } from "../sync/sync";
import type { DealRequest, DealResponse } from "./protocol";

export async function dealPack(req: DealRequest): Promise<DealResponse> {
  await ensureAccount();
  try {
    return await api<DealResponse>("/api/packs/deal", { body: req });
  } catch (err) {
    // The session ended since we last checked: carry on as a guest.
    if (!(err instanceof ApiError && err.status === 401)) throw err;
    await ensureAccount();
    return api<DealResponse>("/api/packs/deal", { body: req });
  }
}
