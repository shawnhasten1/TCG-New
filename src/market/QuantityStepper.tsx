// A quantity from 1 to `max`: − and + buttons either side of a box you can type in. What's typed applies as soon as
// it's a whole number in range; anything else is put back in range when the box loses focus.

import { useState } from "react";

export function QuantityStepper({ value, max, onChange, label, disabled }: { value: number; max: number; onChange(n: number): void; label: string; disabled?: boolean }) {
  /** What's in the box while it's being typed in; undefined shows `value`. */
  const [draft, setDraft] = useState<string>();
  const clamp = (n: number) => Math.min(Math.max(1, Math.floor(n)), Math.max(1, max));

  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label="One fewer" disabled={disabled || value <= 1} onClick={() => onChange(clamp(value - 1))}>
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        value={draft ?? String(value)}
        disabled={disabled}
        aria-label="Quantity"
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isInteger(n) && n >= 1 && n <= max) onChange(n);
        }}
        onBlur={() => {
          if (draft === undefined) return;
          const n = Number(draft);
          onChange(draft === "" || !Number.isFinite(n) ? 1 : clamp(n));
          setDraft(undefined);
        }}
        onFocus={(e) => e.target.select()}
      />
      <button type="button" aria-label="One more" disabled={disabled || value >= max} onClick={() => onChange(clamp(value + 1))}>
        +
      </button>
    </div>
  );
}
