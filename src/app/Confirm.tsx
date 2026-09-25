// Confirmations in the app's own style, in place of the browser's confirm(). `await ask({...})` from anywhere returns
// whether the player went ahead; <ConfirmHost /> (in App) shows the one being asked. It's a native modal <dialog>, so
// focus stays inside it and Escape cancels; so does tapping outside it. Destructive asks start on Cancel.

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";

export interface AskOptions {
  title: string;
  body?: ReactNode;
  /** The button that goes ahead, e.g. "Sell 3 cards". */
  confirm: string;
  cancel?: string;
  /** For something that can't be undone: the confirm button is red and Cancel has focus. */
  danger?: boolean;
}

interface Asking extends AskOptions {
  resolve(ok: boolean): void;
}

let current: Asking | null = null;
const listeners = new Set<() => void>();
const set = (next: Asking | null) => {
  current = next;
  for (const l of listeners) l();
};

/** Asks the player to confirm; resolves true if they go ahead. A new ask cancels one still open. */
export function ask(options: AskOptions): Promise<boolean> {
  current?.resolve(false);
  return new Promise((resolve) => set({ ...options, resolve }));
}

const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));

export function ConfirmHost() {
  const asking = useSyncExternalStore(subscribe, () => current);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (asking && d && !d.open) d.showModal();
  }, [asking]);

  if (!asking) return null;
  const answer = (ok: boolean) => {
    ref.current?.close();
    if (current === asking) set(null);
    asking.resolve(ok);
  };
  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby="confirm-title"
      onCancel={(e) => (e.preventDefault(), answer(false))}
      // A click on the dialog itself, not its contents, is on the backdrop.
      onClick={(e) => e.target === e.currentTarget && answer(false)}
    >
      <div className="confirm-body">
        <h2 id="confirm-title">{asking.title}</h2>
        {asking.body && <p>{asking.body}</p>}
        <div className="confirm-actions">
          <button type="button" onClick={() => answer(false)} autoFocus={asking.danger}>
            {asking.cancel ?? "Cancel"}
          </button>
          <button type="button" className={asking.danger ? "danger" : "primary"} onClick={() => answer(true)} autoFocus={!asking.danger}>
            {asking.confirm}
          </button>
        </div>
      </div>
    </dialog>
  );
}
