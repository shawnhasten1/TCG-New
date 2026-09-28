// Magic set data and prices in the app: from the Worker (which keeps Scryfall's data, worker/mtg.ts), cached on the device.

import { workerCards } from "../app/workerCards";
import { MTG_SETS_SIGNATURE } from "./sets";

export const mtgCards = workerCards({
  prefix: "mtg",
  // Bump with the Worker's SET_VERSION.
  setVersion: 3,
  signature: MTG_SETS_SIGNATURE,
  // Ids are "<set code>-<collector number>", and set codes have no hyphen.
  setOf: (cardId) => cardId.slice(0, cardId.indexOf("-")),
});
