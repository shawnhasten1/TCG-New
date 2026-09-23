// packFinishes must agree exactly with what openPack produces: every predicted finish shows up in
// simulated packs, and nothing shows up that wasn't predicted.

import { describe, expect, it } from "vitest";
import { groupByRarity } from "../api/tcgdex";
import type { Card, SetData, Variants } from "../api/types";
import { openPack, packFinishes, packFirstEdition, preparePack } from "./openPack";
import { profiles } from "./profiles";
import { createRng } from "./rng";
import type { PackProfile } from "./types";

let n = 0;
function card(rarity: string, v: Partial<Variants>, extra: Partial<Card> = {}): Card {
  n++;
  return {
    id: `t-${n}`,
    localId: String(n),
    name: `${rarity} ${n}`,
    image: "img",
    rarity,
    variants: { normal: false, reverse: false, holo: false, firstEdition: false, ...v },
    ...extra,
  };
}
const setOf = (cards: Card[]): SetData => ({
  set: { id: "t", name: "T", serie: { id: "x", name: "x" }, cardCount: { total: cards.length, official: cards.length }, cards: [] },
  cards,
  byRarity: groupByRarity(cards),
  source: "graphql",
  fetchedAt: "",
});
const profile = (id: string) => profiles.find((p) => p.id === id)!;

/** Opens many packs and checks observed (card, finish) pairs equal packFinishes' predictions. */
function expectAgreement(cards: Card[], p: PackProfile, packs = 25_000) {
  const data = setOf(cards);
  const { variantDataMissing } = preparePack(data, p);
  const predicted = new Set(cards.flatMap((c) => packFinishes(c, p, variantDataMissing).map((f) => `${c.name}:${f}`)));
  const predictedFirst = new Set(cards.filter((c) => packFirstEdition(c, p)).map((c) => c.name));
  const seen = new Set<string>();
  const seenFirst = new Set<string>();
  const rng = createRng(`agree:${p.id}`);
  for (let i = 0; i < packs; i++) {
    for (const pull of openPack(data, p, rng)) {
      seen.add(`${pull.card.name}:${pull.finish}`);
      if (pull.firstEdition) seenFirst.add(pull.card.name);
    }
  }
  expect([...seen].sort()).toEqual([...predicted].sort());
  expect([...seenFirst].sort()).toEqual([...predictedFirst].sort());
  return { predicted, variantDataMissing };
}

const many = (k: number, make: () => Card) => Array.from({ length: k }, make);

describe("packFinishes agrees with openPack", () => {
  it("Scarlet & Violet: holo commons stay normal, normal+holo Rares are always holo", () => {
    const holoCommon = card("Common", { normal: true, holo: true, reverse: true });
    const holoUncommon = card("Uncommon", { normal: true, holo: true, reverse: true });
    const dualRare = card("Rare", { normal: true, holo: true, reverse: true });
    const cards = [
      ...many(6, () => card("Common", { normal: true, reverse: true })),
      holoCommon,
      ...many(5, () => card("Uncommon", { normal: true, reverse: true })),
      holoUncommon,
      card("Rare", { holo: true, reverse: true }),
      dualRare,
      card("Double rare", { holo: true }),
      card("Illustration rare", { holo: true }),
      card("Special illustration rare", { holo: true }),
      card("Ultra Rare", { holo: true }),
      card("Hyper rare", { holo: true }),
      card("Promo", { holo: true }),
      card("Common", { normal: true, reverse: true }, { image: undefined }),
      card("Common", { normal: true }, { category: "Energy", energyType: "Normal" }),
    ];
    const { predicted } = expectAgreement(cards, profile("sv"));
    expect(packFinishes(holoCommon, profile("sv"), false)).toEqual(["normal", "reverse"]);
    expect(packFinishes(dualRare, profile("sv"), false)).toEqual(["holo", "reverse"]);
    expect([...predicted].some((k) => k.startsWith("Promo"))).toBe(false);
  });

  it("Sword & Shield: a Holo Rare with a normal printing is always holo", () => {
    const dual = card("Holo Rare", { normal: true, holo: true, reverse: true });
    const cards = [
      ...many(7, () => card("Common", { normal: true, reverse: true })),
      ...many(5, () => card("Uncommon", { normal: true, reverse: true })),
      card("Rare", { normal: true, reverse: true }),
      dual,
      card("Holo Rare V", { holo: true }),
      card("Holo Rare VMAX", { holo: true }),
      card("Ultra Rare", { holo: true }),
      card("Secret Rare", { holo: true }),
      card("Radiant Rare", { holo: true }),
    ];
    expectAgreement(cards, profile("swsh"));
    expect(packFinishes(dual, profile("swsh"), false)).toEqual(["holo", "reverse"]);
  });

  it("Classic with variant data (Diamond & Pearl)", () => {
    expectAgreement(
      [
        ...many(7, () => card("Common", { normal: true, reverse: true })),
        card("Common", { normal: true, holo: true, reverse: true }),
        ...many(5, () => card("Uncommon", { normal: true, reverse: true })),
        card("Rare", { normal: true, reverse: true }),
        card("Rare Holo", { holo: true, reverse: true }),
        card("Rare Holo", { normal: true, holo: true, reverse: true }),
        card("Rare Holo LV.X", { holo: true }),
      ],
      profile("classic"),
    );
  });

  it("Classic without variant data (Sun & Moon): finishes follow the profile", () => {
    const flat = { normal: true };
    const rare = card("Rare", flat);
    const ultra = card("Ultra Rare", flat);
    const { variantDataMissing } = expectAgreement(
      [...many(7, () => card("Common", flat)), ...many(5, () => card("Uncommon", flat)), rare, card("Rare", flat), ultra, card("Secret Rare", flat)],
      profile("classic"),
    );
    expect(variantDataMissing).toBe(true);
    expect(packFinishes(rare, profile("classic"), true)).toEqual(["normal", "holo", "reverse"]);
    expect(packFinishes(ultra, profile("classic"), true)).toEqual(["holo"]);
  });

  it("WOTC: shared 'Rare' string, no reverse slot, 1st Edition when enabled", () => {
    const cards = [
      ...many(9, () => card("Common", { normal: true, reverse: true, firstEdition: true })),
      ...many(4, () => card("Uncommon", { normal: true, firstEdition: true })),
      card("Rare", { holo: true, firstEdition: true }),
      card("Rare", { normal: true, firstEdition: true }),
      card("Holo Rare", { holo: true }),
    ];
    expectAgreement(cards, profile("wotc"));
    expectAgreement(cards, { ...profile("wotc"), firstEditionChance: 0.5 });
  });
});
