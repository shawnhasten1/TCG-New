// "By set / Pokédex / By rarity / Packs" switch shared by the collection pages. A friend's collection has no Pokédex or Packs view.

import { href } from "../app/router";
import { useCollectionSource } from "./source";

export function CollectionViewSwitch({ current }: { current: "set" | "pokemon" | "cards" | "packs" }) {
  const { owner, links } = useCollectionSource();
  return (
    <nav className="segmented view-switch" aria-label="View collection">
      <a href={links.collection()} aria-current={current === "set" ? "page" : undefined}>
        By set
      </a>
      {!owner && (
        <a href={href.pokedex()} aria-current={current === "pokemon" ? "page" : undefined}>
          Pokédex
        </a>
      )}
      <a href={links.cards()} aria-current={current === "cards" ? "page" : undefined}>
        By rarity
      </a>
      {!owner && (
        <a href={href.packs()} aria-current={current === "packs" ? "page" : undefined}>
          Packs
        </a>
      )}
    </nav>
  );
}
