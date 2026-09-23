// Tiny hash router: #/ (set picker), #/open/<setId>, #/collection, #/binder/<setId>,
// #/debug/<setId>, #/foil (foil lab).
import { useEffect, useState } from "react";

export type Route = { page: "picker" } | { page: "open"; setId: string } | { page: "debug"; setId?: string } | { page: "foil" } | { page: "collection" } | { page: "binder"; setId: string };

export function parseRoute(hash: string): Route {
  const [page, id] = hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  if (page === "open" && id) return { page: "open", setId: id };
  if (page === "debug") return { page: "debug", setId: id || undefined };
  if (page === "foil") return { page: "foil" };
  if (page === "collection") return { page: "collection" };
  if (page === "binder" && id) return { page: "binder", setId: id };
  return { page: "picker" };
}

export const href = {
  picker: () => "#/",
  open: (setId: string) => `#/open/${encodeURIComponent(setId)}`,
  debug: (setId: string) => `#/debug/${encodeURIComponent(setId)}`,
  foil: () => "#/foil",
  collection: () => "#/collection",
  binder: (setId: string) => `#/binder/${encodeURIComponent(setId)}`,
};

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const onHash = () => {
      setRoute(parseRoute(location.hash));
      window.scrollTo(0, 0);
    };
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);
  return route;
}
