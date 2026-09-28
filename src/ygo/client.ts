// Yu-Gi-Oh! set data and prices in the app: from the Worker (which keeps YGOPRODeck's data, worker/ygo.ts), cached on the device.

import { workerCards } from "../app/workerCards";
import { ygoSetOf } from "./cards";
import { YGO_SETS_SIGNATURE } from "./sets";

export const ygoCards = workerCards({
  prefix: "ygo",
  // Bump with the Worker's SET_VERSION.
  setVersion: 2,
  signature: YGO_SETS_SIGNATURE,
  setOf: ygoSetOf,
});
