import { describe, expect, it } from "vitest";
import type { Card, CardWithSet, SetSummary } from "../api/types";
import { profiles } from "../engine/profiles";
import { buildPrintings, groupByEra, obtainableFinishes, ownedSpecies, pokemonName, pokemonProgress, searchPokemon } from "./pokedex";
import type { Ownership } from "./progress";

const profile = (id: string) => profiles.find((p) => p.id === id)!;
const summary = (id: string, serie: string, releaseDate: string, name = id): SetSummary => ({
  id,
  name,
  releaseDate,
  serie: { id: serie, name: serie },
  cardCount: { total: 200, official: 150 },
});
const card = (id: string, rarity: string, v: Partial<Card["variants"]> = {}, extra: Partial<CardWithSet> = {}): CardWithSet => ({
  id,
  localId: id.split("-")[1],
  name: "Pikachu",
  image: "img",
  rarity,
  category: "Pokemon",
  dexId: [25],
  set: { id: id.split("-")[0] },
  variants: { normal: false, reverse: false, holo: false, firstEdition: false, ...v },
  ...extra,
});
const own = (cardId: string, byFinish: Partial<Ownership["byFinish"]>, firstEdition = 0): [string, Ownership] => {
  const b = { normal: 0, holo: 0, reverse: 0, ...byFinish };
  return [cardId, { cardId, total: b.normal + b.holo + b.reverse, byFinish: b, firstEdition, firstPulledAt: "2026-01-01", lastPulledAt: "2026-01-02" }];
};

describe("names", () => {
  it("looks up and searches Pokémon names, ignoring accents", () => {
    expect(pokemonName(25)).toBe("Pikachu");
    expect(pokemonName(99999, "Newmon")).toBe("Newmon");
    expect(searchPokemon("pika")[0]).toEqual({ dexId: 25, name: "Pikachu" });
    expect(searchPokemon("flabebe")[0].name).toBe("Flabébé");
    expect(searchPokemon("6")[0].name).toBe("Charizard");
    expect(searchPokemon("")).toEqual([]);
  });
});

describe("obtainableFinishes", () => {
  it("uses printing flags, limited to what the profile can produce", () => {
    expect(obtainableFinishes(card("sv01-1", "Common", { normal: true, reverse: true }), "sv", profile("sv"))).toEqual(["normal", "reverse"]);
    expect(obtainableFinishes(card("sv01-2", "Double rare", { holo: true }), "sv", profile("sv"))).toEqual(["holo"]);
    // WOTC packs have no reverse slot and open Unlimited by default.
    expect(obtainableFinishes(card("base1-58", "Common", { normal: true, reverse: true, firstEdition: true }), "base", profile("wotc"))).toEqual(["normal"]);
    expect(obtainableFinishes(card("base1-58", "Common", { normal: true, firstEdition: true }), "base", { ...profile("wotc"), firstEditionChance: 0.5 })).toEqual(["normal", "firstEdition"]);
  });

  it("assumes the engine's finishes where TCGdex has no variant data (BW/XY/SM)", () => {
    const flat = { normal: true };
    expect(obtainableFinishes(card("sm1-1", "Common", flat), "sm", profile("classic"))).toEqual(["normal", "reverse"]);
    expect(obtainableFinishes(card("sm1-2", "Rare", flat), "sm", profile("classic"))).toEqual(["normal", "holo", "reverse"]);
    expect(obtainableFinishes(card("sm1-3", "Ultra Rare", flat), "sm", profile("classic"))).toEqual(["holo"]);
  });
});

describe("printings", () => {
  const sets = new Map(
    [summary("base1", "base", "1999-01-09", "Base Set"), summary("sv03.5", "sv", "2023-09-22", "151"), summary("sv01", "sv", "2023-03-31"), summary("svp", "sv", "2023-01-01", "SVP Black Star Promos"), summary("A1", "tcgp", "2024-10-30")].map((s) => [s.id, s]),
  );
  const cards = [
    card("sv03.5-025", "Common", { normal: true, reverse: true }),
    card("sv03.5-173", "Illustration rare", { holo: true }),
    card("base1-58", "Common", { normal: true, firstEdition: true }),
    card("sv01-063", "Common", { normal: true, reverse: true }, { image: undefined }),
    card("svp-027", "Promo", { holo: true }),
    card("A1-094", "One Diamond", { normal: true }),
    card("sv01-200", "Crown", { holo: true }),
  ];
  const owned = new Map([own("sv03.5-025", { normal: 2, reverse: 1 }), own("base1-58", { normal: 1 }), own("svp-027", { holo: 1 })]);
  const printings = buildPrintings(cards, { sets, unopenable: {}, owned });
  const by = (id: string) => printings.find((p) => p.card.id === id)!;

  it("marks which printings packs can produce, and why not", () => {
    expect(by("sv03.5-025").pullable).toBe(true);
    expect(by("sv01-063").reason).toBe("No scan");
    expect(by("svp-027").reason).toBe("Promo or special product");
    expect(by("A1-094").reason).toBe("Promo or special product");
    expect(by("sv01-200").reason).toBe("Rarity not in packs");
  });

  it("lists finishes with owned counts", () => {
    expect(by("sv03.5-025").finishes).toEqual([
      { key: "normal", owned: 2, obtainable: true },
      { key: "reverse", owned: 1, obtainable: true },
    ]);
    // Owned from outside packs still shows, but never counts toward completion.
    expect(by("svp-027").finishes).toEqual([{ key: "holo", owned: 1, obtainable: false }]);
  });

  it("measures completion over pullable printings only", () => {
    expect(pokemonProgress(printings)).toEqual({ printingsOwned: 2, printingsTotal: 3, finishesOwned: 3, finishesTotal: 4 });
  });

  it("groups by era, oldest first, then set release date", () => {
    const groups = groupByEra(printings);
    expect(groups.map((g) => g.era)).toEqual(["wotc", "sv", "other"]);
    expect(groups[1].sets.map((s) => s.setId)).toEqual(["sv01", "sv03.5"]);
    expect(groups[2].sets.map((s) => s.setId)).toEqual(["svp", "A1"]);
  });

  it("drops sets found unable to fill a pack", () => {
    const p = buildPrintings([cards[0]], { sets, unopenable: { "sv03.5": "No cards" }, owned });
    expect(p[0]).toMatchObject({ pullable: false, reason: "Set can't fill a pack", era: "other" });
  });
});

describe("ownedSpecies", () => {
  it("groups owned Pokémon by Pokédex number, counting tag teams for each", () => {
    const pika = card("sv03.5-025", "Common", { normal: true });
    const pikaIR = card("sv03.5-173", "Illustration rare", { holo: true });
    const tag = card("sm9-33", "Ultra Rare", { holo: true }, { name: "Pikachu & Zekrom GX", dexId: [25, 644] });
    const trainer: Card = { ...card("sv01-190", "Uncommon"), category: "Trainer", dexId: null };
    const owned = new Map([own(pika.id, { normal: 3 }), own(pikaIR.id, { holo: 1 }), own(tag.id, { holo: 1 }), own(trainer.id, { normal: 1 })]);
    const species = ownedSpecies([pika, pikaIR, tag, trainer], owned);
    const pikachu = species.find((s) => s.dexId === 25)!;
    expect(pikachu).toMatchObject({ name: "Pikachu", printings: 3, copies: 5 });
    expect(pikachu.best.id).toBe("sv03.5-173");
    expect(species.find((s) => s.dexId === 644)?.name).toBe("Zekrom");
    expect(species).toHaveLength(2);
  });
});
