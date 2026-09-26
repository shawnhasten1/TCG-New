// Search box and filter menus shared by the binder and the collection views. Menus with nothing to choose from are left out.

import { useMemo } from "react";
import type { Card } from "../api/types";
import { FINISH_ORDER } from "./cardGroups";
import { CATEGORY_LABEL, filterOptions, isFiltering, NO_FILTER, type CardFilter } from "./cardFilter";
import type { FinishKey } from "./pokedex";

const FINISH_NAME: Record<FinishKey, string> = { firstEdition: "1st Edition", holo: "Holo", reverse: "Reverse holo", normal: "Normal" };

export function CardFilterBar({
  cards,
  filter,
  onChange,
  hide = [],
  placeholder = "Search by name, set, number, type…",
}: {
  /** Every card that could be listed; the menus offer what's among them. */
  cards: Card[];
  filter: CardFilter;
  onChange: (f: CardFilter) => void;
  /** Menus the page already has its own control for. */
  hide?: ("rarity" | "finish")[];
  placeholder?: string;
}) {
  const { categories, types, rarities } = useMemo(() => filterOptions(cards), [cards]);
  const set = (patch: Partial<CardFilter>) => onChange({ ...filter, ...patch });
  // Keep a hidden menu's value when clearing, since the page owns it.
  const clear = () => onChange({ ...NO_FILTER, ...(hide.includes("rarity") && { rarity: filter.rarity }), ...(hide.includes("finish") && { finish: filter.finish }) });
  const active = isFiltering({ ...filter, ...(hide.includes("rarity") && { rarity: "all" }), ...(hide.includes("finish") && { finish: "any" }) });

  return (
    <div className="card-filters">
      <input type="search" placeholder={placeholder} value={filter.query} onChange={(e) => set({ query: e.target.value })} aria-label="Search cards" />
      {categories.length > 1 && (
        <label>
          Card type{" "}
          <select value={filter.category} onChange={(e) => set({ category: e.target.value as CardFilter["category"], type: e.target.value === "Pokemon" || e.target.value === "all" ? filter.type : "all" })}>
            <option value="all">All</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
      )}
      {types.length > 1 && (
        <label>
          Pokémon type{" "}
          <select value={filter.type} onChange={(e) => set({ type: e.target.value })}>
            <option value="all">All</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      )}
      {!hide.includes("rarity") && rarities.length > 1 && (
        <label>
          Rarity{" "}
          <select value={filter.rarity} onChange={(e) => set({ rarity: e.target.value })}>
            <option value="all">All</option>
            {rarities.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      )}
      {!hide.includes("finish") && (
        <label>
          Finish{" "}
          <select value={filter.finish} onChange={(e) => set({ finish: e.target.value as CardFilter["finish"] })}>
            <option value="any">Any</option>
            {FINISH_ORDER.map((k) => (
              <option key={k} value={k}>
                {FINISH_NAME[k]}
              </option>
            ))}
          </select>
        </label>
      )}
      {active && (
        <button type="button" className="link" onClick={clear}>
          Clear filters
        </button>
      )}
    </div>
  );
}
