// Asking the server for a pack (see packs/protocol.ts), and matching a pack's cards to its set for the reveal.

import { api, ApiError } from "../account/account";
import type { SetData } from "../api/types";
import type { PulledCard } from "../engine/types";
import { ensureAccount } from "../sync/sync";
import type { DealRequest, DealResponse, DealtPack } from "./protocol";

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

/** Matches the dealt cards to the set's card data for the reveal, or undefined if the set doesn't have one of them. */
export function toPulls(pack: DealtPack, data: SetData): PulledCard[] | undefined {
  const byId = new Map(data.cards.map((c) => [c.id, c]));
  const pulls = pack.cards.map((c) => {
    const card = byId.get(c.cardId);
    return card && { card, finish: c.finish, firstEdition: c.firstEdition, slot: c.slot, outcome: c.outcome };
  });
  return pulls.every(Boolean) ? (pulls as PulledCard[]) : undefined;
}
