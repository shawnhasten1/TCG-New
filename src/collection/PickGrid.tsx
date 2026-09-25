// Picking cards out of a collection, for a trade or to sell. Copies of the same card (same finish) share a tile;
// tapping it adds another copy until they're all picked, then clears. Styles are in social.css (.pick-page).

import type { ReactNode } from "react";
import { cardImage } from "../api/tcgdex";
import type { Card, SetDetail } from "../api/types";
import { pullTier } from "../engine/tiers";
import type { Finish } from "../engine/types";
import { pullUid, type PullRecord } from "./store";

/** Copies of one card in one finish that someone owns. */
export interface Pickable {
  key: string;
  card: Card;
  set: SetDetail;
  finish: Finish;
  firstEdition: boolean;
  uids: string[];
  tier: number;
}

export function pickables(pulls: PullRecord[], cards: Map<string, { card: Card; set: SetDetail }>): Pickable[] {
  const groups = new Map<string, Pickable>();
  for (const p of pulls) {
    const found = cards.get(p.cardId);
    if (!found) continue;
    const key = `${p.cardId}|${p.finish}|${p.firstEdition ? 1 : 0}`;
    let g = groups.get(key);
    if (!g) {
      const tier = pullTier({ card: found.card, finish: p.finish, firstEdition: p.firstEdition, slot: "", outcome: "" });
      groups.set(key, (g = { key, ...found, finish: p.finish, firstEdition: p.firstEdition, uids: [], tier }));
    }
    g.uids.push(pullUid(p));
  }
  // Best cards first, then by set and number.
  return [...groups.values()].sort((a, b) => b.tier - a.tier || a.set.name.localeCompare(b.set.name) || a.card.localId.localeCompare(b.card.localId, undefined, { numeric: true }));
}

/** Copies picked per tile. */
export type Picked = Map<string, number>;

export const pickedCount = (picked: Picked) => [...picked.values()].reduce((a, b) => a + b, 0);

/** Picked with one more copy of `p`, or none once they're all picked or `max` is reached. */
export function cyclePick(picked: Picked, p: Pickable, max: number): Picked {
  const next = new Map(picked);
  const n = next.get(p.key) ?? 0;
  if (n < p.uids.length && pickedCount(picked) < max) next.set(p.key, n + 1);
  else next.delete(p.key);
  return next;
}

/** The card uids picked, taking copies in the order they're listed. */
export const pickedUids = (items: Pickable[], picked: Picked) => items.flatMap((p) => p.uids.slice(0, picked.get(p.key) ?? 0));

export function PickGrid({ items, picked, onPick, warnLastCopy, note }: { items: Pickable[]; picked: Picked; onPick(p: Pickable): void; warnLastCopy?: boolean; note?(p: Pickable): ReactNode }) {
  return (
    <ul className="pick-grid">
      {items.map((p) => {
        const n = picked.get(p.key) ?? 0;
        const lastCopy = warnLastCopy && n > 0 && n === p.uids.length;
        return (
          <li key={p.key} data-finish={p.finish} data-tier={p.tier} data-picked={n > 0 || undefined}>
            <button type="button" aria-pressed={n > 0} aria-label={`${p.card.name}, ${p.set.name}${p.finish !== "normal" ? `, ${p.finish}` : ""}, ${p.uids.length} owned${n ? `, ${n} picked` : ""}`} onClick={() => onPick(p)}>
              <img src={cardImage(p.card, "low")} alt="" loading="lazy" />
              {p.uids.length > 1 && <span className="count">×{p.uids.length}</span>}
              {n > 0 && <span className="pick-check">{p.uids.length > 1 ? n : "✓"}</span>}
            </button>
            <span className="caption">
              <strong>{p.card.name}</strong>
              <small>
                {p.set.name}
                {p.finish !== "normal" ? ` · ${p.finish}` : ""}
                {p.firstEdition ? " · 1st Ed" : ""}
              </small>
              {note?.(p)}
              {lastCopy && <small className="warn">Your last copy</small>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
