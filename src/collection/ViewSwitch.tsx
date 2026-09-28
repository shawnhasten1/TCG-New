// "By set / Pokédex / By rarity / All cards / Packs" switch shared by the collection pages; Magic and Yu-Gi-Oh! have their card index where
// Pokémon has the Pokédex. A friend's collection has no Pokédex, card index or Packs view, and neither does a game
// without one.

import { has } from "../app/game";
import { href } from "../app/router";
import { useCollectionSource } from "./source";

export function CollectionViewSwitch({ current }: { current: "set" | "pokemon" | "index" | "cards" | "all" | "packs" }) {
  const { owner, links } = useCollectionSource();
  return (
    <nav className="segmented view-switch" aria-label="View collection">
      <a href={links.collection()} aria-current={current === "set" ? "page" : undefined}>
        By set
      </a>
      {!owner && has("pokedex") && (
        <a href={href.pokedex()} aria-current={current === "pokemon" ? "page" : undefined}>
          Pokédex
        </a>
      )}
      {!owner && has("printings") && (
        <a href={href.cardIndex()} aria-current={current === "index" ? "page" : undefined}>
          Card index
        </a>
      )}
      <a href={links.cards()} aria-current={current === "cards" ? "page" : undefined}>
        By rarity
      </a>
      <a href={links.all()} aria-current={current === "all" ? "page" : undefined}>
        All cards
      </a>
      {!owner && has("packArt") && (
        <a href={href.packs()} aria-current={current === "packs" ? "page" : undefined}>
          Packs
        </a>
      )}
    </nav>
  );
}
