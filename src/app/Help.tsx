// A small "?" that shows more detail: on hover where there's a mouse, and on tap (or focus and Enter) anywhere. Tapping
// again, tapping elsewhere or pressing Escape closes it. The bubble drops below the nearest positioned ancestor
// (give the row it sits in `position: relative`), so it spans that row rather than hanging off a small button.

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/** `lines` show as short paragraphs. */
export function Help({ label, lines }: { label: string; lines: ReactNode[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <span className="help" ref={ref} data-open={open || undefined}>
      <button type="button" className="help-button" aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        ?
      </button>
      <span className="help-bubble" id={id} role="note">
        {lines.map((line, i) => (
          <span key={i} className="help-line">
            {line}
          </span>
        ))}
      </span>
    </span>
  );
}
