// The foil lab's Yu-Gi-Oh! section: a real card at each rarity look (ygo/foil.ts), including the foil names. Only shown
// where Yu-Gi-Oh! is switched on (DEMO_GAMES), since its images come through the Worker's /api/ygo routes, which
// only serve a card from a set it's in.

import { cardImageBase } from "../ygo/cards";
import { FoilCard } from "./FoilCard";
import { YGO_LAYOUT } from "./layouts";

interface YgoSample {
  set: string;
  passcode: number;
  name: string;
  frameType: string;
  rarity: string;
}

const BLUE_EYES = { set: "LOB", passcode: 89631139, name: "Blue-Eyes White Dragon", frameType: "normal" };
const POT = { set: "LOB", passcode: 55144522, name: "Pot of Greed", frameType: "spell" };
const MIRROR = { set: "MRD", passcode: 44095762, name: "Mirror Force", frameType: "trap" };
const STARDUST = { set: "TDGS", passcode: 44508094, name: "Stardust Dragon", frameType: "synchro" };
const FIREWALL = { set: "COTD", passcode: 5043010, name: "Firewall Dragon", frameType: "link" };

const SAMPLES: YgoSample[] = [
  { ...POT, rarity: "Rare" },
  { ...MIRROR, rarity: "Super Rare" },
  { ...BLUE_EYES, rarity: "Ultra Rare" },
  { ...MIRROR, rarity: "Ultra Rare" },
  { ...FIREWALL, rarity: "Secret Rare" },
  { ...STARDUST, rarity: "Ultimate Rare" },
  { ...STARDUST, rarity: "Ghost Rare" },
  { ...MIRROR, rarity: "Gold Rare" },
  { ...BLUE_EYES, rarity: "Starlight Rare" },
];

export function YgoFoilSection({ showArtBox }: { showArtBox: boolean }) {
  return (
    <section className="ygo-lab">
      <h2>Yu-Gi-Oh!</h2>
      <p className="muted">
        A Yu-Gi-Oh! card's foil comes with its rarity, and Rare and up print the name in foil too. The looks are in{" "}
        <code>src/ygo/foil.ts</code> and <code>foil.css</code>.
      </p>
      <div className="full-grid">
        {SAMPLES.map((s) => (
          <figure key={`${s.passcode}-${s.rarity}`}>
            <div className="lab-card">
              <FoilCard image={cardImageBase(s.set, s.passcode)} rarity={s.rarity} frameType={s.frameType} finish={/^(common|rare)$/i.test(s.rarity) ? "normal" : "holo"} layout={YGO_LAYOUT} showArtBox={showArtBox} />
            </div>
            <figcaption>
              {s.name}
              <small>
                {s.set} · {s.rarity}
              </small>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
