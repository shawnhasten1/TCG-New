// Decides which sets the picker offers, before any card data is downloaded.
// The real check (whyNotOpenable) runs once the set's cards load.

import type { SetSummary } from "../api/types";
import { profileFor } from "./profiles";

/** Promo, energy, gallery and other non-booster sets, matched by name. */
const NOT_A_BOOSTER = /promo|energy|trainer gallery|sample|futsal|card creator|alternate|best of game|classic collection|trainer kit|starter set|mcdonald/i;

/** Sets smaller than this can't fill a pack without heavy duplication. */
export const MIN_OFFICIAL_CARDS = 40;

export function hiddenReason(set: SetSummary): string | undefined {
  if (!profileFor(set)) return "No pack profile for this series";
  if (NOT_A_BOOSTER.test(set.name)) return "Promo or special set";
  if (set.cardCount.official < MIN_OFFICIAL_CARDS) return `Fewer than ${MIN_OFFICIAL_CARDS} cards`;
  return undefined;
}
