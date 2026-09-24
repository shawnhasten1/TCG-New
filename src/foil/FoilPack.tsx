// A booster pack wrapper with tilt-driven metallic foil, like FoilCard for cards. Tilt writes
// --rx/--ry/--px/--py/--o onto the root element (see opener/tilt.ts); foil.css does the rest.

import { useEffect, type CSSProperties, type HTMLAttributes, type Ref } from "react";
import { ensureSparkles } from "./sparkles";
import "./foil.css";

export interface FoilPackProps extends HTMLAttributes<HTMLDivElement> {
  /** The pack photo. */
  src: string;
  ref?: Ref<HTMLDivElement>;
}

/** The shine layers, shared with the opener's sealed pack (which draws the photo itself). */
export function PackShine() {
  useEffect(ensureSparkles, []);
  return (
    <>
      <div className="pack-foil" />
      <div className="pack-glitter" />
      <div className="pack-glare" />
    </>
  );
}

export function FoilPack({ src, className, style, ref, ...rest }: FoilPackProps) {
  return (
    <div {...rest} ref={ref} className={`foil-pack${className ? " " + className : ""}`} style={{ "--art": `url("${src}")`, ...style } as CSSProperties}>
      <div className="face">
        <img src={src} alt="" draggable={false} />
        <PackShine />
      </div>
    </div>
  );
}
