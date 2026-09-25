// #/market/unopened: packs bought in the shop and kept for later, newest first, each ready to open.

import { useEffect, useState } from "react";
import { Help } from "../app/Help";
import { href } from "../app/router";
import { SetLogo } from "../app/SetLogo";
import { getPulls } from "../collection/store";
import { packArt, packArts } from "../packs/art";
import { ago } from "../social/common";
import { loadUnopened } from "./market";
import { MAX_UNOPENED, type UnopenedPack } from "./shop";
import { RetryImg } from "../app/RetryImg";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function UnopenedTab() {
  const [packs, setPacks] = useState<UnopenedPack[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let live = true;
    Promise.all([loadUnopened(), getPulls()]).then(
      ([res, pulls]) => {
        // A pack opened on this device a moment ago can still be on the server's list until sync catches up.
        const opened = new Set(pulls.map((p) => p.packId));
        if (live) setPacks(res.packs.filter((p) => !opened.has(p.id)));
      },
      (err) => live && setError(message(err)),
    );
    return () => {
      live = false;
    };
  }, []);

  if (error)
    return (
      <p className="error" role="alert">
        {error}
      </p>
    );
  if (!packs)
    return (
      <p className="muted" role="status">
        Loading…
      </p>
    );
  return (
    <>
      <div className="market-head">
        <div className="head-info">
          <p className="balance">
            <span className="muted">Waiting</span> <strong>{packs.length === 1 ? "1 pack" : `${packs.length} packs`}</strong>
          </p>
          <Help label="About unopened packs" lines={["Packs you bought and kept for later. Open them whenever you like.", `You can hold up to ${MAX_UNOPENED}.`]} />
        </div>
      </div>
      {packs.length === 0 ? (
        <p className="muted empty">
          No unopened packs. <a href={href.shop()}>Buy one in the shop</a>.
        </p>
      ) : (
        <ul className="shop-grid unopened">
          {packs.map((p) => {
            const art = packArt(p.setId, p.art) ?? packArts(p.setId)[0];
            return (
              <li key={p.id}>
                <div className="shop-pack">
                  {art ? <RetryImg src={art.src} alt="" loading="lazy" /> : <SetLogo logo={p.logo} alt="" loading="lazy" className="logo" fallback={<span className="logo-fallback">{p.setName ?? p.setId}</span>} />}
                </div>
                <strong className="name">{p.setName ?? p.setId}</strong>
                <small className="muted">Bought {ago(p.boughtAt)}</small>
                <a className="button primary" href={href.openBought(p.id)}>
                  Open
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
