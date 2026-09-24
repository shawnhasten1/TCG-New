// "By set / By Pokémon / By rarity" switch shared by the collection pages.

import { href } from "../app/router";

export function CollectionViewSwitch({ current }: { current: "set" | "pokemon" | "cards" }) {
  return (
    <nav className="segmented view-switch" aria-label="View collection">
      <a href={href.collection()} aria-current={current === "set" ? "page" : undefined}>
        By set
      </a>
      <a href={href.pokedex()} aria-current={current === "pokemon" ? "page" : undefined}>
        By Pokémon
      </a>
      <a href={href.cards()} aria-current={current === "cards" ? "page" : undefined}>
        By rarity
      </a>
    </nav>
  );
}
