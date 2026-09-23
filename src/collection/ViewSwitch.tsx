// "By set / By Pokémon" switch shared by the collection pages.

import { href } from "../app/router";

export function CollectionViewSwitch({ current }: { current: "set" | "pokemon" }) {
  return (
    <nav className="segmented view-switch" aria-label="View collection">
      <a href={href.collection()} aria-current={current === "set" ? "page" : undefined}>
        By set
      </a>
      <a href={href.pokedex()} aria-current={current === "pokemon" ? "page" : undefined}>
        By Pokémon
      </a>
    </nav>
  );
}
