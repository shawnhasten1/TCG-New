// Loads a set (with progress), checks it can fill a pack, and deals packs to the opener.
// Also enforces the optional daily pack limit ("pack of the day").

import { useEffect, useMemo, useRef, useState } from "react";
import type { SetData } from "../api/types";
import { client, markUnopenable } from "../app/client";
import { href } from "../app/router";
import { useSettings } from "../app/settings";
import { formatCountdown, localDay, nextReset, packsLeft, packsOpenedOn } from "../collection/daily";
import { getPulls, savePack, type PullRecord } from "../collection/store";
import { openPack, whyNotOpenable } from "../engine/openPack";
import { profileFor } from "../engine/profiles";
import { createRng } from "../engine/rng";
import { PackOpener } from "./PackOpener";
import "./opener.css";

type Load = { state: "loading"; done: number; total: number } | { state: "error"; message: string } | { state: "ready"; data: SetData };
type PackStamp = Pick<PullRecord, "packId" | "openedAt">;

/** Re-renders every second while `on`, so countdowns tick and day rollovers are noticed. */
function useNow(on: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

export function OpenPage({ setId }: { setId: string }) {
  const { dailyLimit } = useSettings();
  const [load, setLoad] = useState<Load>({ state: "loading", done: 0, total: 0 });
  const [packNo, setPackNo] = useState(0);
  /** Card ids already in the collection, kept current as packs are saved. */
  const owned = useRef<Set<string>>(new Set());
  /** When each saved pack was opened, for the daily limit. */
  const [stamps, setStamps] = useState<PackStamp[]>([]);
  /** Whether the pack on screen has been torn (and so already counted). */
  const [torn, setTorn] = useState(false);

  useEffect(() => {
    let live = true;
    setLoad({ state: "loading", done: 0, total: 0 });
    const collectionLoad = getPulls().then(
      (pulls) => {
        owned.current = new Set(pulls.filter((p) => p.setId === setId).map((p) => p.cardId));
        if (live) setStamps(pulls.map(({ packId, openedAt }) => ({ packId, openedAt })));
      },
      (err) => console.warn("Couldn't read the collection", err),
    );
    client
      .getSetCards(setId, (done, total) => live && setLoad({ state: "loading", done, total }))
      .then(async (data) => (await collectionLoad, data))
      .then(
        (data) => {
          if (!live) return;
          const profile = profileFor(data.set);
          const reason = profile ? whyNotOpenable(data, profile) : "No pack profile for this series";
          if (reason) {
            void markUnopenable(setId, reason);
            setLoad({ state: "error", message: `${data.set.name} can't be opened: ${reason}.` });
          } else setLoad({ state: "ready", data });
        },
        (err) => live && setLoad({ state: "error", message: `Couldn't load this set. ${String(err)}` }),
      );
    return () => {
      live = false;
    };
  }, [setId]);

  const pack = useMemo(() => {
    if (load.state !== "ready") return undefined;
    const profile = profileFor(load.data.set)!;
    const pulls = openPack(load.data, profile, createRng(`${setId}:${Date.now()}:${packNo}`));
    // Decided at deal time, so saving the pack mid-reveal doesn't un-new its cards.
    const newIds = new Set(pulls.map((p) => p.card.id).filter((id) => !owned.current.has(id)));
    return { pulls, newIds };
  }, [load, packNo, setId]);
  const pulls = pack?.pulls;

  const limited = dailyLimit > 0;
  const now = useNow(limited);
  const left = packsLeft(dailyLimit, packsOpenedOn(stamps, localDay(now)));
  const outOfPacks = limited && left === 0;

  const save = () => {
    if (!pulls) return;
    for (const p of pulls) owned.current.add(p.card.id);
    const openedAt = new Date();
    setTorn(true);
    setStamps((s) => [...s, { packId: `pending-${packNo}`, openedAt: openedAt.toISOString() }]);
    savePack(setId, pulls, openedAt).catch((err) => console.warn("Couldn't save this pack", err));
  };

  const next = () => {
    setTorn(false);
    setPackNo((n) => n + 1);
  };

  const back = () => (location.hash = href.picker());

  if (load.state !== "ready" || !pulls) {
    const pct = load.state === "loading" && load.total ? Math.round((load.done / load.total) * 100) : 0;
    return (
      <div className="opener">
        <button type="button" className="back" onClick={back}>
          ← Sets
        </button>
        {load.state === "loading" ? (
          <div className="loading" role="status">
            <p className="hint">{load.total ? `Loading cards… ${load.done} of ${load.total}` : "Loading set…"}</p>
            <div className="progress" aria-hidden="true">
              <div style={{ width: `${pct}%` }} />
            </div>
          </div>
        ) : (
          <p className="hint">{load.state === "error" ? load.message : ""}</p>
        )}
      </div>
    );
  }

  const countdown = formatCountdown(nextReset(now).getTime() - now.getTime());

  // Out of packs, and not in the middle of revealing one: wait for tomorrow.
  if (outOfPacks && !torn) {
    return (
      <div className="opener">
        <button type="button" className="back" onClick={back}>
          ← Sets
        </button>
        <div className="out-of-packs" role="status">
          <h1>That's today's {dailyLimit === 1 ? "pack" : `${dailyLimit} packs`}</h1>
          <p className="hint">
            Next pack in <strong>{countdown}</strong>
          </p>
          <div className="controls">
            <a className="button" href={href.binder(setId)}>
              View binder
            </a>
            <a className="button" href={href.settings()}>
              Change daily limit
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PackOpener
      key={packNo}
      set={load.data.set}
      pulls={pulls}
      newIds={pack!.newIds}
      onOpened={save}
      onAgain={next}
      onBack={back}
      binderHref={href.binder(setId)}
      limitNote={limited ? (left > 0 ? `${left} of ${dailyLimit} ${dailyLimit === 1 ? "pack" : "packs"} left today` : `Next pack in ${countdown}`) : undefined}
      canOpenAgain={!outOfPacks}
    />
  );
}
