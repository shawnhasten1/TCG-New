// Draws a long card list a batch at a time: the first batch straight away, the next when the reader scrolls near the end.
// Thousands of card tiles at once is what made big collections feel frozen.

import { startTransition, useCallback, useEffect, useRef, useState } from "react";

export const BATCH = 96;

/**
 * How many items to draw, and a ref for an element placed after them; when it comes within a screen or so of view,
 * another batch is drawn. The count goes back to one batch whenever `resetKey` changes (a new search, filter or sort).
 */
export function useIncremental(total: number, resetKey: unknown, batch = BATCH) {
  const [limit, setLimit] = useState(batch);
  const [key, setKey] = useState(resetKey);
  if (key !== resetKey) {
    setKey(resetKey);
    setLimit(batch);
  }

  const observer = useRef<IntersectionObserver>(undefined);
  const more = limit < total;
  const sentinel = useCallback(
    (el: HTMLElement | null) => {
      observer.current?.disconnect();
      if (!el || !more) return;
      observer.current = new IntersectionObserver(
        (seen) => {
          if (seen.some((e) => e.isIntersecting)) startTransition(() => setLimit((n) => n + batch));
        },
        { rootMargin: "1200px 0px" },
      );
      observer.current.observe(el);
    },
    // A new limit re-attaches the observer, so a sentinel still in view after a batch loads the next one.
    [more, batch, limit],
  );
  useEffect(() => () => observer.current?.disconnect(), []);

  return { limit: Math.min(limit, total), more, sentinel };
}
