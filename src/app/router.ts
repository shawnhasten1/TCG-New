// Tiny hash router: #/ (home: a pack from a random set), #/sets (set browser), #/collection, #/binder/<setId>,
// #/pokedex, #/pokemon/<dexId>, #/cards, #/feed, #/friends (or #/friends/<code> from an invite link), #/settings, #/debug/<setId>, #/foil (foil lab).
// A friend's collection: #/friend/<id> (by set), #/friend/<id>/cards, #/friend/<id>/binder/<setId>.
// Trades: #/trades, and #/trade/<friendId> to put an offer together.
import { useEffect, useState } from "react";

export type Route = { page: "picker" } | { page: "open" } | { page: "debug"; setId?: string } | { page: "foil" } | { page: "collection" } | { page: "binder"; setId: string } | { page: "settings" } | { page: "pokedex" } | { page: "cards" } | { page: "pokemon"; dexId: number } | { page: "friends"; code?: string } | { page: "feed" } | { page: "friend"; friendId: string; view: "set" | "cards" | "binder"; setId?: string } | { page: "trades" } | { page: "trade"; friendId: string };

export function parseRoute(hash: string): Route {
  const [page, id, sub, subId] = hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  if (page === "sets") return { page: "picker" };
  if (page === "debug") return { page: "debug", setId: id || undefined };
  if (page === "foil") return { page: "foil" };
  if (page === "collection") return { page: "collection" };
  if (page === "settings") return { page: "settings" };
  if (page === "pokedex") return { page: "pokedex" };
  if (page === "cards") return { page: "cards" };
  if (page === "feed") return { page: "feed" };
  if (page === "trades") return { page: "trades" };
  if (page === "trade" && id) return { page: "trade", friendId: id };
  if (page === "friends") return { page: "friends", code: id || undefined };
  if (page === "friend" && id) {
    if (sub === "binder" && subId) return { page: "friend", friendId: id, view: "binder", setId: subId };
    return { page: "friend", friendId: id, view: sub === "cards" ? "cards" : "set" };
  }
  if (page === "pokemon" && /^\d+$/.test(id ?? "")) return { page: "pokemon", dexId: Number(id) };
  if (page === "binder" && id) return { page: "binder", setId: id };
  // Home is the opener. Packs always come from a random set, so old #/open and #/open/<setId> links land here too.
  return { page: "open" };
}

export const href = {
  picker: () => "#/sets",
  open: () => "#/",
  debug: (setId: string) => `#/debug/${encodeURIComponent(setId)}`,
  foil: () => "#/foil",
  collection: () => "#/collection",
  settings: () => "#/settings",
  pokedex: () => "#/pokedex",
  cards: () => "#/cards",
  feed: () => "#/feed",
  trades: () => "#/trades",
  /** Put together an offer for a friend. */
  trade: (friendId: string) => `#/trade/${encodeURIComponent(friendId)}`,
  /** A friend's collection, or one of its binders. */
  friend: (friendId: string, setId?: string) => `#/friend/${encodeURIComponent(friendId)}${setId ? `/binder/${encodeURIComponent(setId)}` : ""}`,
  friendCards: (friendId: string) => `#/friend/${encodeURIComponent(friendId)}/cards`,
  friends: (code?: string) => (code ? `#/friends/${encodeURIComponent(code)}` : "#/friends"),
  pokemon: (dexId: number) => `#/pokemon/${dexId}`,
  binder: (setId: string) => `#/binder/${encodeURIComponent(setId)}`,
};

/** Old #/open and #/open/<setId> links: tidy the address, since home is the opener and the set is always random. */
function tidyOpenLink() {
  if (/^#\/open(\/|$)/.test(location.hash)) history.replaceState(null, "", "#/");
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => (tidyOpenLink(), parseRoute(location.hash)));
  useEffect(() => {
    const onHash = () => {
      tidyOpenLink();
      setRoute(parseRoute(location.hash));
      window.scrollTo(0, 0);
    };
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);
  return route;
}
