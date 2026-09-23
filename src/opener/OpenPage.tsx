// Loads a set (with progress), checks it can fill a pack, and deals packs to the opener.

import { useEffect, useMemo, useState } from "react";
import type { SetData } from "../api/types";
import { client, markUnopenable } from "../app/client";
import { href } from "../app/router";
import { openPack, whyNotOpenable } from "../engine/openPack";
import { profileFor } from "../engine/profiles";
import { createRng } from "../engine/rng";
import { PackOpener } from "./PackOpener";
import "./opener.css";

type Load = { state: "loading"; done: number; total: number } | { state: "error"; message: string } | { state: "ready"; data: SetData };

export function OpenPage({ setId }: { setId: string }) {
  const [load, setLoad] = useState<Load>({ state: "loading", done: 0, total: 0 });
  const [packNo, setPackNo] = useState(0);

  useEffect(() => {
    let live = true;
    setLoad({ state: "loading", done: 0, total: 0 });
    client
      .getSetCards(setId, (done, total) => live && setLoad({ state: "loading", done, total }))
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

  const pulls = useMemo(() => {
    if (load.state !== "ready") return undefined;
    const profile = profileFor(load.data.set)!;
    return openPack(load.data, profile, createRng(`${setId}:${Date.now()}:${packNo}`));
  }, [load, packNo, setId]);

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

  return <PackOpener key={packNo} set={load.data.set} pulls={pulls} onAgain={() => setPackNo((n) => n + 1)} onBack={back} />;
}
