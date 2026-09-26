import { describe, expect, it } from "vitest";
import type { Card } from "../api/types";
import { filterOptions, matchesCard, NO_FILTER, type CardFilter } from "./cardFilter";
import type { Ownership } from "./progress";

const card = (c: Partial<Card>): Card => ({ id: "sv1-1", localId: "1", name: "", rarity: "Common", variants: {}, ...c }) as Card;
const pikachu = card({ id: "sv1-25", localId: "025", name: "Pikachu", rarity: "Rare", category: "Pokemon", dexId: [25], types: ["Lightning"], stage: "Basic" });
const flabebe = card({ id: "sv1-7", localId: "7", name: "Flabébé", category: "Pokemon", dexId: [669], types: ["Psychic"] });
const potion = card({ id: "sv1-TG05", localId: "TG05", name: "Potion", category: "Trainer", trainerType: "Item" });
const owned = (holo: number): Ownership => ({ cardId: "x", total: 1, byFinish: { normal: 1 - holo, holo, reverse: 0 }, firstEdition: 0, firstPulledAt: "", lastPulledAt: "" });

const match = (c: Card, f: Partial<CardFilter>, opts?: Parameters<typeof matchesCard>[2]) => matchesCard(c, { ...NO_FILTER, ...f }, opts);

describe("matchesCard", () => {
  it("matches everything with no filter", () => {
    expect([pikachu, flabebe, potion].every((c) => match(c, {}))).toBe(true);
  });

  it("searches name, set, type, stage and trainer type, ignoring case and accents", () => {
    expect(match(pikachu, { query: "pika" })).toBe(true);
    expect(match(flabebe, { query: "flabebe" })).toBe(true);
    expect(match(pikachu, { query: "lightning basic" })).toBe(true);
    expect(match(pikachu, { query: "lightning stage2" })).toBe(false);
    expect(match(potion, { query: "item" })).toBe(true);
    expect(match(potion, { query: "scarlet" }, { setName: "Scarlet & Violet" })).toBe(true);
  });

  it("matches numbers against card number and Pokédex number", () => {
    expect(match(pikachu, { query: "#25" })).toBe(true);
    expect(match(pikachu, { query: "25" })).toBe(true);
    expect(match(flabebe, { query: "669" })).toBe(true);
    expect(match(flabebe, { query: "#669" })).toBe(false);
    expect(match(potion, { query: "#tg05" })).toBe(true);
  });

  it("filters by category, type, rarity and owned finish", () => {
    expect(match(potion, { category: "Trainer" })).toBe(true);
    expect(match(pikachu, { category: "Trainer" })).toBe(false);
    expect(match(pikachu, { type: "Lightning" })).toBe(true);
    expect(match(flabebe, { type: "Lightning" })).toBe(false);
    expect(match(pikachu, { rarity: "Rare" })).toBe(true);
    expect(match(pikachu, { finish: "holo" }, { owned: owned(1) })).toBe(true);
    expect(match(pikachu, { finish: "holo" }, { owned: owned(0) })).toBe(false);
    expect(match(pikachu, { finish: "holo" })).toBe(false);
  });

  it("keeps only favorites when asked", () => {
    const favorites = new Set([pikachu.id]);
    expect(match(pikachu, { favorites: true }, { favorites })).toBe(true);
    expect(match(flabebe, { favorites: true }, { favorites })).toBe(false);
    expect(match(pikachu, { favorites: true })).toBe(false);
    expect(match(flabebe, {}, { favorites })).toBe(true);
    expect(match(pikachu, { favorites: true, query: "pika" }, { favorites })).toBe(true);
  });
});

describe("filterOptions", () => {
  it("lists what's present", () => {
    expect(filterOptions([pikachu, flabebe, potion])).toEqual({ categories: ["Pokemon", "Trainer"], types: ["Lightning", "Psychic"], rarities: ["Rare", "Common"] });
  });
});
