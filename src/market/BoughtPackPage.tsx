// #/market/open/<packId>: open a pack bought in the shop, in the same opener as dealt packs. It was rolled when it
// was bought, so this only shows it. Tearing it saves it here and opens it on the server through sync, like a dealt
// pack; bought packs don't count against the free-pack allowance or toward pity.

import { useEffect, useState } from "react";
import { isMember, useAccount } from "../account/account";
import type { SetData } from "../api/types";
import { client } from "../app/client";
import { href } from "../app/router";
import { getPulls, savePack } from "../collection/store";
import type { PulledCard } from "../engine/types";
import { OpenerBar } from "../opener/OpenerBar";
import { PackOpener } from "../opener/PackOpener";
import { preloadImage, withTimeout } from "../opener/preload";
import { packArt } from "../packs/art";
import { toPulls } from "../packs/deal";
import type { DealtPack } from "../packs/protocol";
import { shareCards } from "../social/feed";
import { syncNow } from "../sync/sync";
import { loadBoughtPack, loadUnopened } from "./market";
import type { UnopenedPack } from "./shop";
import "../social/social.css"; // the summary's share picker
import "../opener/opener.css";

interface Ready {
  pack: DealtPack;
  data: SetData;
  pulls: PulledCard[];
  newIds: Set<string>;
}

type Stage = { state: "loading"; done: number; total: number } | { state: "error"; message: string } | { state: "ready"; ready: Ready };

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Unopened packs besides `packId`, leaving out any opened on this device that sync hasn't caught up with. */
async function othersThan(packId: string): Promise<UnopenedPack[]> {
  const [{ packs }, pulls] = await Promise.all([loadUnopened(), getPulls()]);
  const opened = new Set(pulls.map((p) => p.packId));
  return packs.filter((p) => p.id !== packId && !opened.has(p.id));
}

export function BoughtPackPage({ packId }: { packId: string }) {
  const member = isMember(useAccount());
  const [stage, setStage] = useState<Stage>({ state: "loading", done: 0, total: 0 });
  const [others, setOthers] = useState<UnopenedPack[]>([]);

  useEffect(() => {
    let live = true;
    (async () => {
      const pack = await loadBoughtPack(packId);
      const progress = (done: number, total: number) => live && setStage({ state: "loading", done, total });
      let data = await client.getSetCards(pack.setId, progress);
      let pulls = toPulls(pack, data);
      if (!pulls) {
        // This device's copy of the set is older than the server's: fetch it again.
        await client.forgetSetCards(pack.setId);
        data = await client.getSetCards(pack.setId, progress);
        pulls = toPulls(pack, data);
        if (!pulls) throw new Error("This pack has cards the card database doesn't know yet. Try again in a while.");
      }
      const have = new Set((await getPulls(pack.setId)).map((p) => p.cardId));
      const newIds = new Set(pulls.map((p) => p.card.id).filter((id) => !have.has(id)));
      const art = packArt(pack.setId, pack.art);
      if (art) await withTimeout(preloadImage(art.src), 4000);
      if (live) setStage({ state: "ready", ready: { pack, data, pulls, newIds } });
    })().catch((err) => live && setStage({ state: "error", message: errorText(err) }));
    othersThan(packId).then(
      (o) => live && setOthers(o),
      () => undefined, // just no "next pack" button
    );
    return () => {
      live = false;
    };
  }, [packId]);

  if (stage.state !== "ready") {
    const pct = stage.state === "loading" && stage.total ? Math.round((stage.done / stage.total) * 100) : 0;
    return (
      <div className="opener">
        <OpenerBar />
        {stage.state === "error" ? (
          <div className="loading">
            <p className="hint">{stage.message}</p>
            <div className="controls">
              <a className="button" href={href.unopened()}>
                Your unopened packs
              </a>
            </div>
          </div>
        ) : (
          <div className="loading" role="status">
            <p className="hint">{stage.total ? `Loading cards… ${stage.done} of ${stage.total}` : "Getting your pack…"}</p>
            <div className="progress" aria-hidden="true">
              <div style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>
    );
  }

  const { pack, data, pulls, newIds } = stage.ready;
  const wrapper = packArt(pack.setId, pack.art);
  const save = () => {
    savePack(pack.dealId, data.set.id, pulls, new Date(), wrapper?.id).then(
      () => void syncNow(),
      (err) => console.warn("Couldn't save this pack", err),
    );
  };
  const next = () => {
    window.scrollTo(0, 0);
    location.hash = others.length ? href.openBought(others[0].id) : href.unopened();
  };
  return (
    <PackOpener
      set={data.set}
      pulls={pulls}
      newIds={newIds}
      packPhoto={wrapper}
      onOpened={save}
      onAgain={next}
      binderHref={href.binder(data.set.id)}
      limitNote={others.length ? `${others.length} more unopened ${others.length === 1 ? "pack" : "packs"}` : "Your last unopened pack"}
      canOpenAgain={others.length > 0}
      againLabel="Open the next one"
      onShare={member ? (slots) => shareCards(pack.dealId, slots) : undefined}
    />
  );
}
