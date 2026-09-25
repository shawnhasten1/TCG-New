import { describe, expect, it } from "vitest";
import type { Card, SetDetail } from "../api/types";
import type { OwnedCard } from "./cardGroups";
import { sortCards } from "./cardSort";

const set = { id: "sv1", name: "Scarlet & Violet", releaseDate: "2023-03-31", cardCount: { total: 258, official: 198 } } as unknown as SetDetail;
const entry = (id: string, name: string, lastPulledAt: string, dexId?: number[]): OwnedCard => ({
  card: { id, localId: id.split("-")[1], name, rarity: "Common", variants: {}, dexId } as Card,
  set,
  owned: { cardId: id, total: 1, byFinish: { normal: 1, holo: 0, reverse: 0 }, firstEdition: 0, firstPulledAt: lastPulledAt, lastPulledAt },
});

const pikachu = entry("sv1-1", "Pikachu", "2026-01-03", [25]);
const potion = entry("sv1-2", "Potion", "2026-01-05");
const bulbasaur = entry("sv1-3", "Bulbasaur", "2026-01-01", [1]);
const energy = entry("sv1-4", "Basic Grass Energy", "2026-01-02");
const all = [pikachu, potion, bulbasaur, energy];
const ids = (list: OwnedCard[]) => list.map((e) => e.card.name);

describe("sortCards", () => {
  it("sorts by most recently pulled", () => {
    expect(ids(sortCards(all, "recent"))).toEqual(["Potion", "Pikachu", "Basic Grass Energy", "Bulbasaur"]);
  });

  it("sorts by Pokédex number, with Trainers and Energy after by name", () => {
    expect(ids(sortCards(all, "dex"))).toEqual(["Bulbasaur", "Pikachu", "Basic Grass Energy", "Potion"]);
  });

  it("sorts by name", () => {
    expect(ids(sortCards(all, "name"))).toEqual(["Basic Grass Energy", "Bulbasaur", "Pikachu", "Potion"]);
  });

  it("sorts by value, highest first, unpriced cards last by recency", () => {
    const value = new Map([["sv1-3", 12], ["sv1-1", 3.5]]);
    expect(ids(sortCards(all, "value", (e) => value.get(e.card.id)))).toEqual(["Bulbasaur", "Pikachu", "Potion", "Basic Grass Energy"]);
  });

  it("leaves the input alone", () => {
    sortCards(all, "name");
    expect(ids(all)).toEqual(["Pikachu", "Potion", "Bulbasaur", "Basic Grass Energy"]);
  });
});
