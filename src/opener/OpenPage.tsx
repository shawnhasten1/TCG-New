// Deals packs from randomly chosen sets. There is no manual set choice: every pack, including
// "Open another pack", draws a new set. The next set is drawn and downloaded while you reveal
// the current pack, so the next wrapper is usually ready at once.
// Set rarity pity (see engine/setRarity.ts) counts from the saved packs, so it survives reloads and backups.
// Also enforces the daily pack limit ("pack of the day"), which recharges a pack at a time once it runs out.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SetData, SetSummary } from "../api/types";
import { client, getUnopenable, markUnopenable } from "../app/client";
import { href } from "../app/router";
import { useSettings } from "../app/settings";
import { formatCountdown, packAllowance, RECHARGE_MS } from "../collection/daily";
import { getPulls, savePack, type PullRecord } from "../collection/store";
import { openPack, whyNotOpenable } from "../engine/openPack";
import { profileFor } from "../engine/profiles";
import { drawableSets, pickRandomSet } from "../engine/randomSet";
import { createRng } from "../engine/rng";
import { pityFloor } from "../engine/setRarity";
import { OpenerNav } from "./OpenerNav";
import { PackOpener } from "./PackOpener";
import "./opener.css";

type Stage =
  | { state: "starting" }
  | { state: "loading"; set: SetSummary; done: number; total: number }
  | { state: "error"; message: string }
  | { state: "ready"; data: SetData; dealNo: number };
type PackStamp = Pick<PullRecord, "packId" | "openedAt">;
type Draw = { set: SetSummary; data?: Promise<SetData>; ready?: boolean };

/** Draws that fail (set can't fill a pack) are retried with another set this many times. */
const MAX_REDRAWS = 6;

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

/** The set of each saved pack, oldest first. */
function packHistory(pulls: PullRecord[]): string[] {
  const packs = new Map<string, Pick<PullRecord, "setId" | "openedAt">>();
  for (const p of pulls) if (!packs.has(p.packId)) packs.set(p.packId, p);
  return [...packs.values()].sort((a, b) => a.openedAt.localeCompare(b.openedAt)).map((p) => p.setId);
}

export function OpenPage() {
  const { dailyLimit, eras } = useSettings();
  const [stage, setStage] = useState<Stage>({ state: "starting" });
  /** When each saved pack was opened, for the daily limit. */
  const [stamps, setStamps] = useState<PackStamp[]>();
  /** Whether the pack on screen has been torn (and so already counted). */
  const [torn, setTorn] = useState(false);

  /** Card ids already collected, per set, kept current as packs are saved. */
  const owned = useRef(new Map<string, Set<string>>());
  const summaries = useRef<SetSummary[] | undefined>(undefined);
  const unopenable = useRef<Record<string, string>>({});
  /** Set of every opened pack, oldest first, for the set rarity pity. */
  const history = useRef<string[]>([]);
  /** The next pack's set, drawn and downloading in the background. */
  const upcoming = useRef<Draw | undefined>(undefined);
  /** Increments per dealt pack; keys the opener and seeds the pack. */
  const dealCount = useRef(0);
  const live = useRef(true);
  const erasKey = eras.join(",");

  /** Draws a set that isn't known to be unopenable. */
  const draw = useCallback((avoid?: string): SetSummary | undefined => {
    const pool = drawableSets(summaries.current ?? [], { unopenable: unopenable.current, eras: erasKey ? erasKey.split(",") : [] });
    return pickRandomSet(pool, Math.random, { avoid, floor: pityFloor(history.current) });
  }, [erasKey]);
  const drawNext = useCallback((avoid?: string) => {
    const set = draw(avoid);
    return set && { set };
  }, [draw]);

  /** Loads a drawn set and puts a pack from it on screen, redrawing if it can't fill a pack. */
  const deal = useCallback(
    async (first: Draw | undefined) => {
      let next = first;
      for (let attempt = 0; attempt <= MAX_REDRAWS && next; attempt++) {
        const { set } = next;
        // A prefetched, already-downloaded set skips the loading screen.
        if (!next.ready) setStage({ state: "loading", set, done: 0, total: 0 });
        try {
          const data = await (next.data ?? client.getSetCards(set.id, (done, total) => live.current && setStage({ state: "loading", set, done, total })));
          if (!live.current) return;
          const profile = profileFor(data.set);
          const reason = profile ? whyNotOpenable(data, profile) : "No pack profile for this series";
          if (!reason) {
            setStage({ state: "ready", data, dealNo: ++dealCount.current });
            return;
          }
          unopenable.current[set.id] = reason;
          void markUnopenable(set.id, reason);
          next = drawNext(set.id);
        } catch (err) {
          if (live.current) setStage({ state: "error", message: `Couldn't load ${set.name}. ${String(err)}` });
          return;
        }
      }
      if (live.current) setStage({ state: "error", message: "No set could be opened. Check the era filter in Settings." });
    },
    [drawNext],
  );

  // Start: load what the draw needs, then deal the first pack.
  useEffect(() => {
    live.current = true;
    (async () => {
      const [sets, unopen, pulls] = await Promise.all([
        client.listSetSummaries(),
        getUnopenable(),
        getPulls().catch((err) => (console.warn("Couldn't read the collection", err), [] as PullRecord[])),
      ]);
      if (!live.current) return;
      summaries.current = sets;
      unopenable.current = { ...unopen };
      for (const p of pulls) (owned.current.get(p.setId) ?? owned.current.set(p.setId, new Set()).get(p.setId)!).add(p.cardId);
      history.current = packHistory(pulls);
      setStamps(pulls.map(({ packId, openedAt }) => ({ packId, openedAt })));
      const first = draw();
      if (!first) setStage({ state: "error", message: "No set could be opened. Check the era filter in Settings." });
      else void deal({ set: first });
    })().catch((err) => live.current && setStage({ state: "error", message: `Couldn't load the set list. ${String(err)}` }));
    return () => {
      live.current = false;
    };
  }, [draw, deal]);

  const data = stage.state === "ready" ? stage.data : undefined;
  const dealNo = stage.state === "ready" ? stage.dealNo : 0;
  const pack = useMemo(() => {
    if (!data) return undefined;
    const profile = profileFor(data.set)!;
    const pulls = openPack(data, profile, createRng(`${data.set.id}:${Date.now()}:${dealNo}`));
    // Decided at deal time, so saving the pack mid-reveal doesn't un-new its cards.
    const have = owned.current.get(data.set.id);
    const newIds = new Set(pulls.map((p) => p.card.id).filter((id) => !have?.has(id)));
    return { pulls, newIds };
  }, [data, dealNo]);

  const limited = dailyLimit > 0;
  const now = useNow(limited);
  const { left, nextAt } = packAllowance(stamps ?? [], dailyLimit, now);
  const outOfPacks = limited && left === 0;
  const countdown = nextAt ? formatCountdown(nextAt.getTime() - now.getTime()) : "";

  const save = () => {
    if (!pack || !data) return;
    const setId = data.set.id;
    const have = owned.current.get(setId) ?? owned.current.set(setId, new Set()).get(setId)!;
    for (const p of pack.pulls) have.add(p.card.id);
    history.current.push(setId);
    const openedAt = new Date();
    setTorn(true);
    setStamps((s) => [...(s ?? []), { packId: `pending-${dealNo}`, openedAt: openedAt.toISOString() }]);
    savePack(setId, pack.pulls, openedAt).catch((err) => console.warn("Couldn't save this pack", err));
    // Draw and start downloading the next pack's set while this one is revealed.
    const nextSet = draw();
    if (nextSet) {
      const up: Draw = { set: nextSet, data: client.getSetCards(nextSet.id) };
      up.data!.then(() => void (up.ready = true), () => undefined); // errors surface when dealt
      upcoming.current = up;
    }
  };

  const next = () => {
    setTorn(false);
    const up = upcoming.current ?? drawNext();
    upcoming.current = undefined;
    void deal(up);
  };


  // Out of packs, and not in the middle of revealing one: wait for the next recharge.
  if (stamps && outOfPacks && !torn) {
    return (
      <div className="opener">
        <OpenerNav />
        <div className="out-of-packs" role="status">
          <h1>Out of packs</h1>
          <p className="hint">You've used up your packs for now. A pack recharges every {RECHARGE_MS / 60_000} minutes, up to {dailyLimit}.</p>
          <p className="recharge">
            Next pack in <strong>{countdown}</strong>
          </p>
          <div className="controls">
            <a className="button primary" href={href.collection()}>
              Your collection
            </a>
            <a className="button" href={href.settings()}>
              Pack limit
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (!pack || !data) {
    const loading = stage.state === "loading" ? stage : undefined;
    const pct = loading?.total ? Math.round((loading.done / loading.total) * 100) : 0;
    return (
      <div className="opener">
        <OpenerNav />
        {stage.state === "error" ? (
          <div className="loading">
            <p className="hint">{stage.message}</p>
            <div className="controls">
              <button type="button" onClick={() => void deal(drawNext())}>
                Try again
              </button>
            </div>
          </div>
        ) : (
          <div className="loading" role="status">
            <p className="hint">{loading ? (loading.total ? `Loading cards… ${loading.done} of ${loading.total}` : "Finding your pack…") : "Finding your pack…"}</p>
            <div className="progress" aria-hidden="true">
              <div style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <PackOpener
      key={dealNo}
      set={data.set}
      pulls={pack.pulls}
      newIds={pack.newIds}
      onOpened={save}
      onAgain={next}
      binderHref={href.binder(data.set.id)}
      limitNote={limited ? (left === 0 ? `Next pack in ${countdown}` : `${left} of ${dailyLimit} ${dailyLimit === 1 ? "pack" : "packs"} left${nextAt ? ` · next in ${countdown}` : ""}`) : undefined}
      canOpenAgain={!outOfPacks}
    />
  );
}
