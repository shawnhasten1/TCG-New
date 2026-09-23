// A card up close: tiltable foil in each owned finish, copies, first pull, and market prices.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { CardPricing } from "../api/tcgdex";
import type { Card } from "../api/types";
import { client } from "../app/client";
import type { Finish } from "../engine/types";
import { FoilCard } from "../foil/FoilCard";
import type { FrameLayout } from "../foil/layouts";
import { href } from "../app/router";
import { Tilt } from "../opener/tilt";
import { pokemonName } from "./pokedex";
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
  const slotRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<{ x: number; y: number; s: number } | null>(null);
  const [spun, setSpun] = useState(false);
  const idle = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const d = dialogRef.current!;
    if (!d.open) d.showModal();
    tilt.setActive(cardRef.current, 14);
    tilt.start();
    // No d.close() here: it fires onClose, which would unmount the dialog on StrictMode's
    // re-run. Unmounting removes the element, which closes it anyway.
    return () => tilt.stop();
  }, [tilt]);

  /* ---------- Showcase: the card flies to the middle of the screen, grows, spins once, and sways ---------- */
  const fit = () => {
    // Measured after the dialog drops its scrolling (.zoomed), so the offset is from where the slot now sits.
    const r = slotRef.current!.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const s = Math.max(1, Math.min((vw * 0.9) / r.width, (vh * 0.9) / r.height, 2.2));
    setZoom({ x: vw / 2 - (r.left + r.width / 2), y: vh / 2 - (r.top + r.height / 2), s });
  };
  const [zoomed, setZoomed] = useState(false);
  useLayoutEffect(() => {
    if (!zoomed) {
      setZoom(null);
      return;
    }
    fit();
    setSpun(true);
    tilt.showcase(Infinity, reduced ? 0 : 1100);
    const onResize = () => fit();
    addEventListener("resize", onResize);
    return () => {
      removeEventListener("resize", onResize);
      clearTimeout(idle.current);
      tilt.rest();
    };
  }, [zoomed, tilt, reduced]);

  /** Tilts toward the pointer; while zoomed, anywhere on screen counts, and the sway resumes when it goes still. */
  const onPointerMove = (e: PointerEvent) => {
    if (!zoomed && !slotRef.current?.contains(e.target as Node)) return;
    tilt.aim(e.clientX, e.clientY);
    if (!zoomed) return;
    clearTimeout(idle.current);
    idle.current = setTimeout(() => tilt.showcase(), 2500);
  };

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
      aria-label={card.name}
      className={`card-detail${zoomed ? " zoomed" : ""}`}
      onClose={onClose}
      onCancel={(e) => {
        // Escape backs out of the showcase before it closes the dialog.
        if (!zoomed) return;
        e.preventDefault();
        setZoomed(false);
      }}
      onClick={(e) => {
        if (zoomed) setZoomed(false);
        else if (e.target === dialogRef.current) dialogRef.current.close();
      }}
      onPointerMove={onPointerMove}
    >
      <div className="detail-body">
        <div className="detail-card" ref={slotRef} onPointerLeave={() => !zoomed && tilt.rest()}>
          <div
            className="showcase"
            role="button"
            tabIndex={0}
            aria-pressed={zoomed}
            aria-label={zoomed ? "Put the card back" : "Show the card up close"}
            style={zoom ? ({ "--zx": `${zoom.x}px`, "--zy": `${zoom.y}px`, "--zs": zoom.s } as CSSProperties) : undefined}
            onClick={(e) => {
              e.stopPropagation();
              setZoomed(!zoomed);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              setZoomed(!zoomed);
            }}
          >
            <div className={`spin${spun ? " spun" : ""}`}>
              <FoilCard ref={cardRef} image={card.image} rarity={card.rarity} finish={finish} layout={layout} className={owned ? "" : "unowned"} />
              <div className="tcg-back" aria-hidden="true" />
            </div>
          </div>
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

          {card.category === "Pokemon" && !!card.dexId?.length && (
            <p className="species-links">
              {card.dexId.map((d) => (
                <a key={d} href={href.pokemon(d)} onClick={() => dialogRef.current?.close()}>
                  All {pokemonName(d)} cards →
                </a>
              ))}
            </p>
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
