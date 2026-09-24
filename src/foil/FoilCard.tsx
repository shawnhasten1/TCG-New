// A card scan with tilt-driven foil. Tilt writes --rx/--ry/--px/--py/--o onto the root element
// (see opener/tilt.ts); the layers below read them.

import { useEffect, useState, type CSSProperties, type HTMLAttributes, type Ref } from "react";
import type { CardCategory } from "../api/types";
import type { Finish } from "../engine/types";
import { artMask, reverseMask, type FrameLayout, type HoloPattern } from "./layouts";
import { reverseTexture, typeSymbol, type ReversePattern } from "./reverse";
import { ensureSparkles } from "./sparkles";
import { foilStyle, foilTint, foilTreatment, type Style, type Treatment } from "./treatment";
import "./foil.css";

export interface FoilCardProps extends HTMLAttributes<HTMLDivElement> {
  /** TCGdex image base URL (no quality/extension). */
  image?: string;
  rarity: string;
  finish: Finish;
  layout: FrameLayout;
  /** Tells gold secret rares (Items, Tools, Stadiums, Energy) from rainbow ones. */
  category?: CardCategory;
  trainerType?: string | null;
  /** Pokémon types: reverse holos from XY on show the first one's symbol in the foil. */
  types?: string[] | null;
  /** Overrides the era's reverse holo pattern (foil lab). */
  reversePattern?: ReversePattern;
  /** Overrides the era's holo rare pattern (foil lab). */
  holoPattern?: HoloPattern;
  /** Overrides the treatment derived from finish + rarity (foil lab). */
  treatment?: Treatment;
  /** Overrides the style derived from finish + rarity; null turns it off (foil lab). */
  foilStyle?: Style | null;
  quality?: "high" | "low";
  /** Draws the layout's art box, for tuning. */
  showArtBox?: boolean;
  ref?: Ref<HTMLDivElement>;
}

const masks = new Map<string, CSSProperties>();
function maskVars(layout: FrameLayout): CSSProperties {
  let vars = masks.get(layout.id);
  if (!vars) masks.set(layout.id, (vars = { "--art-mask": artMask(layout), "--rev-mask": reverseMask(layout) } as CSSProperties));
  return vars;
}

function reverseVars(pattern: ReversePattern, category?: CardCategory, types?: string[] | null): CSSProperties {
  const tex = reverseTexture(pattern, typeSymbol(category, types));
  return (tex ? { "--rev-tex": tex } : {}) as CSSProperties;
}

export function FoilCard({ image, rarity, finish, layout, category, trainerType, types, reversePattern, holoPattern, treatment, foilStyle: styleOverride, quality = "high", showArtBox, className, style, ref, ...rest }: FoilCardProps) {
  const t = treatment ?? foilTreatment(finish, rarity);
  const kind = { category, trainerType };
  const look = styleOverride === undefined ? foilStyle(finish, rarity, kind) : (styleOverride ?? undefined);
  const rev = t === "reverse" ? (reversePattern ?? layout.reverse) : undefined;
  // Rarity styles (e.g. promo cosmos) bring their own pattern; plain holo rares get the era's.
  const holo = t === "holo" && !look ? (holoPattern ?? layout.holo) : undefined;
  const [src, setSrc] = useState(image && `${image}/${quality}.webp`);
  useEffect(() => setSrc(image && `${image}/${quality}.webp`), [image, quality]);
  useEffect(ensureSparkles, []);

  return (
    <div
      {...rest}
      ref={ref}
      className={`tcg-card${className ? " " + className : ""}`}
      data-treatment={t}
      data-tint={foilTint(rarity, kind)}
      data-style={t === "none" ? undefined : look}
      data-rev={rev}
      data-holo={holo}
      style={{ ...(t === "holo" || t === "reverse" ? maskVars(layout) : undefined), ...(rev ? reverseVars(rev, category, types) : undefined), ...style }}
    >
      <div className="face">
        {src && <img src={src} alt="" draggable={false} onError={() => quality === "high" && image && setSrc(`${image}/low.webp`)} />}
        {t !== "none" && <div className="foil" />}
        {t === "etched" && <div className="etch" />}
        {(t === "fullart" || t === "etched") && <div className="glitter" />}
        <div className="glare" />
        {showArtBox && (
          <svg className="art-box" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <rect x={layout.art.x} y={layout.art.y} width={layout.art.w} height={layout.art.h} />
            <rect className="border" x={layout.border.x} y={layout.border.y} width={100 - 2 * layout.border.x} height={100 - 2 * layout.border.y} />
          </svg>
        )}
      </div>
    </div>
  );
}
