// Deals packs from the server (worker/packs.ts), which picks the set, rolls the cards and enforces the pack
// allowance. A dealt pack stays the same until it's torn, so reloading shows it again rather than a new one.
// The next pack is dealt and its set downloaded while you reveal the current one, so it's usually ready at once.
// Set rarity pity is enforced by the server too; the note here counts from the saved packs.

import { useCallback, useEffect, useRef, useState } from "react";
import { isMember, useAccount } from "../account/account";
import type { SetData } from "../api/types";
import { client } from "../app/client";
import { href } from "../app/router";
import { useSettings } from "../app/settings";
import { formatCountdown } from "../collection/daily";
import { getPulls, savePack, type PullRecord } from "../collection/store";
import { guaranteeNote } from "../engine/setRarity";
import type { PulledCard } from "../engine/types";
import { dealPack } from "../packs/deal";
import { RECHARGE_MS, type Allowance, type DealResponse, type DealtPack } from "../packs/protocol";
import { shareCards } from "../social/feed";
import { OpenerNav } from "./OpenerNav";
import { PackOpener } from "./PackOpener";
import "./opener.css";

/** A dealt pack with its set's cards, ready to show. */
interface Ready {
  pack: DealtPack;
  data: SetData;
  pulls: PulledCard[];
  newIds: Set<string>;
}

type Stage =
  | { state: "starting" }
  | { state: "loading"; done: number; total: number }
  | { state: "error"; message: string }
  | { state: "out" }
  | { state: "ready"; ready: Ready; dealNo: number };

/** A deal answered and its set downloaded (no `ready` when out of packs). */
type Dealt = { res: DealResponse; ready?: Ready };
/** The next deal, requested while the current pack is revealed. */
type Upcoming = { promise: Promise<Dealt>; settled: boolean };

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Re-renders every second while `on`, so countdowns tick and recharges are noticed. */
function useNow(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
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

/** Matches the dealt cards to the set's card data for the reveal. */
function toPulls(pack: DealtPack, data: SetData): PulledCard[] | undefined {
  const byId = new Map(data.cards.map((c) => [c.id, c]));
  const pulls = pack.cards.map((c) => {
    const card = byId.get(c.cardId);
    return card && { card, finish: c.finish, firstEdition: c.firstEdition, slot: c.slot, outcome: c.outcome };
  });
  return pulls.every(Boolean) ? (pulls as PulledCard[]) : undefined;
}

export function OpenPage() {
  const { eras } = useSettings();
  const member = isMember(useAccount());
  const [stage, setStage] = useState<Stage>({ state: "starting" });
  /** From the last deal: counted before its pack was torn. */
  const [allowance, setAllowance] = useState<Allowance>();
  /** Whether the pack on screen has been torn (and so already counted). */
  const [torn, setTorn] = useState(false);

  /** Card ids already collected, per set, kept current as packs are saved. */
  const owned = useRef(new Map<string, Set<string>>());
  /** Set of every opened pack, oldest first, for the pity note. */
  const history = useRef<string[]>([]);
  const upcoming = useRef<Upcoming | undefined>(undefined);
  /** Increments per dealt pack; keys the opener. */
  const dealCount = useRef(0);
  const live = useRef(true);
  const erasRef = useRef(eras);
  erasRef.current = eras;

  /** Asks for a pack (opening `opened` first) and downloads its set. */
  const request = useCallback(async (opened?: string, onProgress?: (done: number, total: number) => void): Promise<Dealt> => {
    const res = await dealPack({ eras: erasRef.current, opened });
    if (!res.pack) return { res };
    const { pack } = res;
    let data = await client.getSetCards(pack.setId, onProgress);
    let pulls = toPulls(pack, data);
    if (!pulls) {
      // This device's copy of the set is older than the server's: fetch it again.
      await client.forgetSetCards(pack.setId);
      data = await client.getSetCards(pack.setId, onProgress);
      pulls = toPulls(pack, data);
      if (!pulls) throw new Error("This pack has cards the card database doesn't know yet. Try again in a while.");
    }
    // Decided at deal time, so saving the pack mid-reveal doesn't un-new its cards.
    const have = owned.current.get(pack.setId);
    const newIds = new Set(pulls.map((p) => p.card.id).filter((id) => !have?.has(id)));
    return { res, ready: { pack, data, pulls, newIds } };
  }, []);

  /** Puts a pack on screen: the one dealt ahead of time, or a fresh deal. */
  const show = useCallback(
    async (up?: Upcoming) => {
      if (!up?.settled) setStage({ state: "loading", done: 0, total: 0 });
      try {
        const { res, ready } = await (up?.promise ?? request(undefined, (done, total) => live.current && setStage({ state: "loading", done, total })));
        if (!live.current) return;
        setAllowance(res.allowance);
        setTorn(false);
        setStage(ready ? { state: "ready", ready, dealNo: ++dealCount.current } : { state: "out" });
      } catch (err) {
        if (live.current) setStage({ state: "error", message: errorText(err) });
      }
    },
    [request],
  );

  // Start: read the collection (for "new" badges and the pity note), then get a pack.
  useEffect(() => {
    live.current = true;
    (async () => {
      const pulls = await getPulls().catch((err) => (console.warn("Couldn't read the collection", err), [] as PullRecord[]));
      if (!live.current) return;
      for (const p of pulls) (owned.current.get(p.setId) ?? owned.current.set(p.setId, new Set()).get(p.setId)!).add(p.cardId);
      history.current = packHistory(pulls);
      await show();
    })();
    return () => {
      live.current = false;
    };
  }, [show]);

  const ready = stage.state === "ready" ? stage.ready : undefined;
  const limit = allowance?.limit ?? 0;
  const left = allowance ? Math.max(0, allowance.left - (torn ? 1 : 0)) : 0;
  const now = useNow(!!allowance?.nextAt);
  // A pack comes back at nextAt, then one every RECHARGE_MS after it.
  const recharged = allowance?.nextAt && now >= allowance.nextAt ? Math.floor((now - allowance.nextAt) / RECHARGE_MS) + 1 : 0;
  const available = Math.min(limit, left + recharged);
  const nextAt = allowance?.nextAt && available < limit ? allowance.nextAt + recharged * RECHARGE_MS : undefined;
  const countdown = nextAt ? formatCountdown(nextAt - now) : "";

  // Out of packs: ask again once one has come back.
  useEffect(() => {
    if (stage.state === "out" && available > 0) void show();
  }, [stage.state, available, show]);

  const save = () => {
    if (!ready) return;
    const { pack, data, pulls } = ready;
    const have = owned.current.get(pack.setId) ?? owned.current.set(pack.setId, new Set()).get(pack.setId)!;
    for (const p of pulls) have.add(p.card.id);
    history.current.push(pack.setId);
    setTorn(true);
    savePack(pack.dealId, data.set.id, pulls).catch((err) => console.warn("Couldn't save this pack", err));
    // Deal the next pack now (the server opens this one first) and download its set during the reveal.
    const up: Upcoming = { promise: request(pack.dealId), settled: false };
    up.promise.then(
      () => void (up.settled = true),
      () => undefined, // errors surface when it's shown
    );
    upcoming.current = up;
  };

  const next = () => {
    const up = upcoming.current;
    upcoming.current = undefined;
    void show(up);
  };

  if (stage.state === "out") {
    return (
      <div className="opener">
        <OpenerNav />
        <div className="out-of-packs" role="status">
          <h1>Out of packs</h1>
          <p className="hint">
            You can hold up to {limit} packs. Once you're below that, one comes back every {RECHARGE_MS / 60_000} minutes.
          </p>
          <p className="recharge">
            Next pack in <strong>{countdown}</strong>
          </p>
          <div className="controls">
            <a className="button primary" href={href.collection()}>
              Your collection
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (!ready) {
    const loading = stage.state === "loading" ? stage : undefined;
    const pct = loading?.total ? Math.round((loading.done / loading.total) * 100) : 0;
    return (
      <div className="opener">
        <OpenerNav />
        {stage.state === "error" ? (
          <div className="loading">
            <p className="hint">{stage.message}</p>
            <div className="controls">
              <button type="button" onClick={() => void show()}>
                Try again
              </button>
            </div>
          </div>
        ) : (
          <div className="loading" role="status">
            <p className="hint">{loading?.total ? `Loading cards… ${loading.done} of ${loading.total}` : "Finding your pack…"}</p>
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
      key={stage.state === "ready" ? stage.dealNo : 0}
      set={ready.data.set}
      pulls={ready.pulls}
      newIds={ready.newIds}
      onOpened={save}
      onAgain={next}
      binderHref={href.binder(ready.data.set.id)}
      // Counts after the pack on screen, whose set is already known, so it reads the same once torn.
      pityNote={guaranteeNote(torn ? history.current : [...history.current, ready.pack.setId])}
      limitNote={available === 0 ? `Next pack in ${countdown}` : `${available} of ${limit} ${limit === 1 ? "pack" : "packs"} left${nextAt ? ` · next in ${countdown}` : ""}`}
      canOpenAgain={available > 0}
      onShare={member ? (slots) => shareCards(ready.pack.dealId, slots) : undefined}
    />
  );
}
