// Search box and filter menus shared by the binder and the collection views. The menus fold away behind a "Filters" button
// so the page stays tidy on a phone; menus with nothing to choose from are left out.

import { useMemo, useState, type ReactNode } from "react";
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
  children,
  pageFiltersInUse = 0,
}: {
  /** Every card that could be listed; the menus offer what's among them. */
  cards: Card[];
  filter: CardFilter;
  onChange: (f: CardFilter) => void;
  /** Menus the page already has its own control for. */
  hide?: ("rarity" | "finish")[];
  placeholder?: string;
  /** The page's own controls (sort, price toggle…), shown first in the panel. */
  children?: ReactNode;
  /** How many of the page's own filters in `children` are in use, for the badge. */
  pageFiltersInUse?: number;
}) {
  const [open, setOpen] = useState(false);
  const { categories, types, rarities } = useMemo(() => filterOptions(cards), [cards]);
  const set = (patch: Partial<CardFilter>) => onChange({ ...filter, ...patch });
  // Keep a hidden menu's value when clearing, since the page owns it.
  const clear = () => onChange({ ...NO_FILTER, ...(hide.includes("rarity") && { rarity: filter.rarity }), ...(hide.includes("finish") && { finish: filter.finish }) });
  const active = isFiltering({ ...filter, ...(hide.includes("rarity") && { rarity: "all" }), ...(hide.includes("finish") && { finish: "any" }) });
  // Menus in use, for the badge on the button (the search box shows itself).
  const inUse = pageFiltersInUse + [filter.category !== "all", filter.type !== "all", !hide.includes("rarity") && filter.rarity !== "all", !hide.includes("finish") && filter.finish !== "any"].filter(Boolean).length;

  return (
    <div className="card-filters">
      <div className="search-row">
        <input type="search" placeholder={placeholder} value={filter.query} onChange={(e) => set({ query: e.target.value })} aria-label="Search cards" />
        <button type="button" className="filters-toggle" aria-expanded={open} aria-controls="card-filter-panel" onClick={() => setOpen(!open)}>
          Filters{inUse > 0 && <span className="badge">{inUse}</span>}
        </button>
      </div>
      {open && (
        <div className="filter-panel" id="card-filter-panel">
          {children}
          {categories.length > 1 && (
            <label className="field">
              <span>Card type</span>
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
            <label className="field">
              <span>Pokémon type</span>
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
            <label className="field">
              <span>Rarity</span>
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
            <label className="field">
              <span>Finish</span>
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
      )}
    </div>
  );
}
