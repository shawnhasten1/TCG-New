// Preloads a pack's high-quality images while the pack is being torn, so nothing pops in late.

import { cardImage } from "../api/tcgdex";
import type { PulledCard } from "../engine/types";

/** Resolves once every image has loaded or failed. Never rejects. */
export function preloadPack(pulls: PulledCard[]): Promise<void> {
  return Promise.all(
    pulls.map((p) => {
      const src = cardImage(p.card, "high");
      if (!src) return undefined;
      const img = new Image();
      img.decoding = "async";
      img.src = src;
      return img.decode().catch(() => undefined);
    }),
  ).then(() => undefined);
}

export function withTimeout(p: Promise<void>, ms: number): Promise<void> {
  return Promise.race([p, new Promise<void>((r) => setTimeout(r, ms))]);
}
