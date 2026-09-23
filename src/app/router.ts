// Tiny hash router: #/ (home + set browser), #/open (a pack from a random set), #/collection, #/binder/<setId>,
// #/debug/<setId>, #/foil (foil lab).
import { useEffect, useState } from "react";

export type Route = { page: "picker" } | { page: "open" } | { page: "debug"; setId?: string } | { page: "foil" } | { page: "collection" } | { page: "binder"; setId: string } | { page: "settings" };

export function parseRoute(hash: string): Route {
  const [page, id] = hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  // Packs always come from a random set; old #/open/<setId> links still land on a random pack.
  if (page === "open") return { page: "open" };
  if (page === "debug") return { page: "debug", setId: id || undefined };
  if (page === "foil") return { page: "foil" };
  if (page === "collection") return { page: "collection" };
  if (page === "settings") return { page: "settings" };
  if (page === "binder" && id) return { page: "binder", setId: id };
  return { page: "picker" };
}

export const href = {
  picker: () => "#/",
  open: () => "#/open",
  debug: (setId: string) => `#/debug/${encodeURIComponent(setId)}`,
  foil: () => "#/foil",
  collection: () => "#/collection",
  settings: () => "#/settings",
  binder: (setId: string) => `#/binder/${encodeURIComponent(setId)}`,
};

/** Old #/open/<setId> links: tidy the address, since the set is always random. */
function tidyOpenLink() {
  if (location.hash.startsWith("#/open/")) history.replaceState(null, "", "#/open");
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
