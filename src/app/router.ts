// Tiny hash router: #/ (home: a pack from a random set), #/sets (set browser), #/collection, #/binder/<setId>,
// #/pokedex, #/pokemon/<dexId>, #/cards, #/settings, #/debug/<setId>, #/foil (foil lab).
import { useEffect, useState } from "react";

export type Route = { page: "picker" } | { page: "open" } | { page: "debug"; setId?: string } | { page: "foil" } | { page: "collection" } | { page: "binder"; setId: string } | { page: "settings" } | { page: "pokedex" } | { page: "cards" } | { page: "pokemon"; dexId: number };

export function parseRoute(hash: string): Route {
  const [page, id] = hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  if (page === "sets") return { page: "picker" };
  if (page === "debug") return { page: "debug", setId: id || undefined };
  if (page === "foil") return { page: "foil" };
  if (page === "collection") return { page: "collection" };
  if (page === "settings") return { page: "settings" };
  if (page === "pokedex") return { page: "pokedex" };
  if (page === "cards") return { page: "cards" };
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
