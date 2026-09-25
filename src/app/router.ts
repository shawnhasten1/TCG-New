// Tiny hash router: #/ (home: a pack from a random set), #/sets (set browser), #/collection, #/binder/<setId>,
// #/pokedex, #/pokemon/<dexId>, #/cards, #/all (every card, sortable), #/feed, #/friends (or #/friends/<code> from an invite link), #/settings, #/debug/<setId>, #/foil (foil lab), #/pack-lab (pack photo lab), #/packs (collected pack wrappers).
// A friend's collection: #/friend/<id> (by set), #/friend/<id>/cards, #/friend/<id>/all, #/friend/<id>/binder/<setId>.
// Trades: #/trades, and #/trade/<friendId> to put an offer together.
// Market: #/market (your listings), #/market/pick (choose cards to sell), #/market/shop (buy packs), #/market/wallet (coins).
import { useEffect, useState } from "react";

export type MarketTab = "sell" | "shop" | "wallet";

export type Route = { page: "picker" } | { page: "open" } | { page: "debug"; setId?: string } | { page: "foil" } | { page: "packLab" } | { page: "packs" } | { page: "collection" } | { page: "binder"; setId: string } | { page: "settings" } | { page: "pokedex" } | { page: "cards" } | { page: "all" } | { page: "pokemon"; dexId: number } | { page: "friends"; code?: string } | { page: "feed" } | { page: "friend"; friendId: string; view: "set" | "cards" | "all" | "binder"; setId?: string } | { page: "trades" } | { page: "trade"; friendId: string } | { page: "market"; tab: MarketTab } | { page: "marketPick" };

export function parseRoute(hash: string): Route {
  const [page, id, sub, subId] = hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  if (page === "sets") return { page: "picker" };
  if (page === "debug") return { page: "debug", setId: id || undefined };
  if (page === "foil") return { page: "foil" };
  if (page === "pack-lab") return { page: "packLab" };
  if (page === "packs") return { page: "packs" };
  if (page === "collection") return { page: "collection" };
  if (page === "settings") return { page: "settings" };
  if (page === "pokedex") return { page: "pokedex" };
  if (page === "cards") return { page: "cards" };
  if (page === "all") return { page: "all" };
  if (page === "feed") return { page: "feed" };
  if (page === "trades") return { page: "trades" };
  if (page === "market") return id === "pick" ? { page: "marketPick" } : { page: "market", tab: id === "wallet" || id === "shop" ? id : "sell" };
  if (page === "trade" && id) return { page: "trade", friendId: id };
  if (page === "friends") return { page: "friends", code: id || undefined };
  if (page === "friend" && id) {
    if (sub === "binder" && subId) return { page: "friend", friendId: id, view: "binder", setId: subId };
    return { page: "friend", friendId: id, view: sub === "cards" || sub === "all" ? sub : "set" };
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
  packLab: () => "#/pack-lab",
  packs: () => "#/packs",
  collection: () => "#/collection",
  settings: () => "#/settings",
  pokedex: () => "#/pokedex",
  cards: () => "#/cards",
  all: () => "#/all",
  feed: () => "#/feed",
  trades: () => "#/trades",
  market: () => "#/market",
  marketPick: () => "#/market/pick",
  shop: () => "#/market/shop",
  wallet: () => "#/market/wallet",
  /** Put together an offer for a friend. */
  trade: (friendId: string) => `#/trade/${encodeURIComponent(friendId)}`,
  /** A friend's collection, or one of its binders. */
  friend: (friendId: string, setId?: string) => `#/friend/${encodeURIComponent(friendId)}${setId ? `/binder/${encodeURIComponent(setId)}` : ""}`,
  friendCards: (friendId: string) => `#/friend/${encodeURIComponent(friendId)}/cards`,
  friendAll: (friendId: string) => `#/friend/${encodeURIComponent(friendId)}/all`,
  friends: (code?: string) => (code ? `#/friends/${encodeURIComponent(code)}` : "#/friends"),
  pokemon: (dexId: number) => `#/pokemon/${dexId}`,
  binder: (setId: string) => `#/binder/${encodeURIComponent(setId)}`,
};

/** The main menu's sections. */
export type NavSection = "open" | "collection" | "sets" | "market" | "social" | "settings";

/** Which section of the main menu a page belongs to (none for the dev tools). */
export function navSection(route: Route): NavSection | undefined {
  switch (route.page) {
    case "open":
      return "open";
    case "collection":
    case "binder":
    case "pokedex":
    case "pokemon":
    case "cards":
    case "all":
    case "packs":
      return "collection";
    case "picker":
      return "sets";
    case "market":
    case "marketPick":
      return "market";
    case "feed":
    case "friends":
    case "trades":
    case "trade":
    case "friend":
      return "social";
    case "settings":
      return "settings";
    default:
      return undefined;
  }
}

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
