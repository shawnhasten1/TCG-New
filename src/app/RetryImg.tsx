// Remote images sometimes fail (a dropped connection, a busy CDN), and a plain <img> never tries again.
// These step through fallbacks (a card's high-quality scan, then its low one), then retry the last with backoff,
// adding ?retry=N so the browser really refetches instead of reusing the failure. Out of retries, they try
// once more whenever the browser comes back online.

import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";

const DELAYS = [500, 1500, 4000, 8000];

export function retryUrl(src: string, attempt: number): string {
  return attempt ? `${src}${src.includes("?") ? "&" : "?"}retry=${attempt}` : src;
}

type Sources = string | (string | undefined)[] | undefined;

/** The URL to show now, and a callback for when it fails to load. */
export function useRetriedSrc(sources: Sources): { src: string | undefined; failed: () => void } {
  const srcs = (Array.isArray(sources) ? sources : [sources]).filter((s): s is string => !!s);
  const key = srcs.join("\n");
  const [state, setState] = useState({ key, index: 0, attempt: 0, dead: false });
  // Start over when the image changes, since the same element can be reused for another card.
  const cur = state.key === key ? state : { key, index: 0, attempt: 0, dead: false };
  const timer = useRef<number>(undefined);

  useEffect(() => () => clearTimeout(timer.current), [key]);
  useEffect(() => {
    if (!cur.dead) return;
    const again = () => setState({ ...cur, attempt: cur.attempt + 1, dead: false });
    window.addEventListener("online", again);
    return () => window.removeEventListener("online", again);
  }, [cur.dead, key]);

  const failed = () => {
    if (cur.index < srcs.length - 1) return setState({ ...cur, index: cur.index + 1, attempt: 0 });
    if (cur.attempt >= DELAYS.length) return setState({ ...cur, dead: true });
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState({ ...cur, attempt: cur.attempt + 1 }), DELAYS[cur.attempt]);
  };

  return { src: srcs.length ? retryUrl(srcs[cur.index], cur.attempt) : undefined, failed };
}

/** An image drawn with CSS (a background or mask): loads it off-screen to notice failures. */
export function useRetriedCssSrc(sources: Sources): string | undefined {
  const { src, failed } = useRetriedSrc(sources);
  const onFail = useRef(failed);
  onFail.current = failed;
  useEffect(() => {
    if (!src) return;
    const img = new Image();
    img.onerror = () => onFail.current();
    img.src = src;
    return () => void (img.onerror = null);
  }, [src]);
  return src;
}

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  /** One URL, or several to fall back through in order. */
  src: Sources;
};

export function RetryImg({ src: sources, onError, ...img }: Props) {
  const { src, failed } = useRetriedSrc(sources);
  return (
    <img
      {...img}
      src={src}
      onError={(e) => {
        failed();
        onError?.(e);
      }}
    />
  );
}
