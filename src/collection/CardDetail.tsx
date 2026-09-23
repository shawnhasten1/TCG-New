// A card up close: tiltable foil in each owned finish, copies, first pull, and market prices.

import { useEffect, useMemo, useRef, useState } from "react";
import type { CardPricing } from "../api/tcgdex";
import type { Card } from "../api/types";
import { client } from "../app/client";
import type { Finish } from "../engine/types";
import { FoilCard } from "../foil/FoilCard";
import type { FrameLayout } from "../foil/layouts";
import { Tilt } from "../opener/tilt";
import { formatPrice, priceFor } from "./prices";
import type { Ownership } from "./progress";

const FINISH_LABEL: Record<Finish, string> = { normal: "Normal", holo: "Holo", reverse: "Reverse holo" };

/** Finishes this card can be printed in, most special first. */
function printings(card: Card): Finish[] {
  const out: Finish[] = [];
  if (card.variants.holo) out.push("holo");
  if (card.variants.reverse) out.push("reverse");
  if (card.variants.normal || !out.length) out.push("normal");
  return out;
}

interface Props {
  card: Card;
  official: number;
  owned?: Ownership;
  layout: FrameLayout;
  onClose(): void;
}

export function CardDetail({ card, official, owned, layout, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const reduced = useMemo(() => matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const tilt = useMemo(() => new Tilt(reduced), [reduced]);
  const ownedFinishes = (["holo", "reverse", "normal"] as Finish[]).filter((f) => (owned?.byFinish[f] ?? 0) > 0);
  const finishes = owned ? ownedFinishes : printings(card);
  const [finish, setFinish] = useState<Finish>(finishes[0]);
  const [pricing, setPricing] = useState<CardPricing | null | "loading" | "error">("loading");

  useEffect(() => {
    const d = dialogRef.current!;
    if (!d.open) d.showModal();
    tilt.setActive(cardRef.current, 14);
    tilt.start();
    // No d.close() here: it fires onClose, which would unmount the dialog on StrictMode's
    // re-run. Unmounting removes the element, which closes it anyway.
    return () => tilt.stop();
  }, [tilt]);

  useEffect(() => {
    let live = true;
    client.getCardPricing(card.id).then(
      (p) => live && setPricing(p),
      () => live && setPricing("error"),
    );
    return () => {
      live = false;
    };
  }, [card.id]);

  const firstEd = (owned?.firstEdition ?? 0) > 0;

  return (
    <dialog
      ref={dialogRef}
      className="card-detail"
      aria-label={card.name}
      onClose={onClose}
      onClick={(e) => e.target === dialogRef.current && dialogRef.current.close()}
    >
      <div className="detail-body">
        <div className="detail-card" onPointerMove={(e) => tilt.aim(e.clientX, e.clientY)} onPointerLeave={() => tilt.rest()}>
          <FoilCard ref={cardRef} image={card.image} rarity={card.rarity} finish={finish} layout={layout} className={owned ? "" : "unowned"} />
        </div>
        <div className="detail-info">
          <h2>{card.name}</h2>
          <p className="muted">
            #{card.localId}
            {/^\d+$/.test(card.localId) ? ` / ${official}` : ""} · {card.rarity}
            {card.category ? ` · ${card.category === "Pokemon" ? "Pokémon" : card.category}` : ""}
          </p>

          {finishes.length > 1 && (
            <div className="finish-tabs" role="group" aria-label="Show finish">
              {finishes.map((f) => (
                <button key={f} type="button" aria-pressed={f === finish} onClick={() => setFinish(f)}>
                  {FINISH_LABEL[f]}
                </button>
              ))}
            </div>
          )}

          {owned ? (
            <>
              <h3>In your collection</h3>
              <ul className="copies">
                {ownedFinishes.map((f) => (
                  <li key={f}>
                    {FINISH_LABEL[f]} <strong>×{owned.byFinish[f]}</strong>
                  </li>
                ))}
                {firstEd && <li>1st Edition ×{owned.firstEdition}</li>}
              </ul>
              <p className="muted">First pulled {new Date(owned.firstPulledAt).toLocaleDateString()}</p>
            </>
          ) : (
            <p className="muted">Not pulled yet.</p>
          )}

          <h3>Market price</h3>
          {pricing === "loading" && <p className="muted">Loading prices…</p>}
          {pricing === "error" && <p className="muted">Couldn't load prices.</p>}
          {pricing !== "loading" && pricing !== "error" && (
            <ul className="prices">
              {printings(card).map((f) => {
                const price = priceFor(pricing, f, firstEd);
                return (
                  <li key={f}>
                    {FINISH_LABEL[f]}
                    <span>{price ? `${formatPrice(price)} · ${price.source}` : "no data"}</span>
                  </li>
                );
              })}
            </ul>
          )}

          <button type="button" className="close" onClick={() => dialogRef.current?.close()}>
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
}
