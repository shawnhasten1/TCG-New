// Favorite cards, from the Worker's /api/favorites. They're by card, not copy, so any card can be one, owned or not.
// Loaded once per account when first needed; starring updates straight away and is undone if the server refuses.

import { useEffect, useState } from "react";
import { api, getAccount, onAccountChange } from "../account/account";

export interface FavoritesResponse {
  cardIds: string[];
}

interface State {
  /** Whose favorites these are; undefined when nobody's signed in. */
  account?: string;
  ids: ReadonlySet<string>;
  /** Whether they've come from the server yet. */
  loaded: boolean;
}

let state: State = { ids: new Set(), loaded: false };
let loading: Promise<void> | undefined;
const events = new EventTarget();

function set(next: State) {
  state = next;
  events.dispatchEvent(new Event("change"));
}

const signedInAs = () => {
  const a = getAccount();
  return a.status === "signedIn" ? a.user?.id : undefined;
};

function load() {
  const account = signedInAs();
  if (!account) return;
  loading ??= api<FavoritesResponse>("/api/favorites")
    .then(
      (res) => void (account === signedInAs() && set({ account, ids: new Set(res.cardIds), loaded: true })),
      (err) => console.warn("Couldn't load favorites", err),
    )
    .finally(() => (loading = undefined));
}

onAccountChange(() => {
  const account = signedInAs();
  if (account === state.account) return;
  set({ account, ids: new Set(), loaded: false });
  if (account) load();
});

/** Stars or unstars a card. Throws (after putting it back) if the server refuses. */
export async function setFavorite(cardId: string, on: boolean): Promise<void> {
  const account = signedInAs();
  if (!account) return;
  const change = (add: boolean) => {
    const ids = new Set(state.ids);
    if (add) ids.add(cardId);
    else ids.delete(cardId);
    set({ ...state, account, ids });
  };
  change(on);
  try {
    await api(`/api/favorites/${encodeURIComponent(cardId)}`, { method: on ? "PUT" : "DELETE" });
  } catch (err) {
    if (account === signedInAs()) change(!on);
    throw err;
  }
}

/** The signed-in player's favorites; `available` is false when nobody's signed in, so there's nothing to star. */
export function useFavorites(): { ids: ReadonlySet<string>; available: boolean } {
  const [s, setS] = useState(state);
  useEffect(() => {
    const on = () => setS(state);
    events.addEventListener("change", on);
    on();
    if (!state.loaded) {
      if (state.account !== signedInAs()) set({ account: signedInAs(), ids: new Set(), loaded: false });
      load();
    }
    return () => events.removeEventListener("change", on);
  }, []);
  return { ids: s.ids, available: !!s.account };
}
