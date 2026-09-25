import { describe, expect, it } from "vitest";
import { navSection, parseRoute } from "./router";

describe("navSection", () => {
  const section = (hash: string) => navSection(parseRoute(hash));

  it("puts every page under its menu section", () => {
    expect(section("#/")).toBe("open");
    expect(section("#/collection")).toBe("collection");
    expect(section("#/binder/base1")).toBe("collection");
    expect(section("#/pokedex")).toBe("collection");
    expect(section("#/pokemon/25")).toBe("collection");
    expect(section("#/cards")).toBe("collection");
    expect(section("#/all")).toBe("collection");
    expect(section("#/packs")).toBe("collection");
    expect(section("#/sets")).toBe("sets");
    expect(section("#/market")).toBe("market");
    expect(section("#/market/pick")).toBe("market");
    expect(section("#/market/wallet")).toBe("market");
    expect(section("#/feed")).toBe("social");
    expect(section("#/friends/abc")).toBe("social");
    expect(section("#/trades")).toBe("social");
    expect(section("#/trade/u1")).toBe("social");
    expect(section("#/friend/u1/binder/base1")).toBe("social");
    expect(section("#/settings")).toBe("settings");
  });

  it("tells the market's pages apart", () => {
    expect(parseRoute("#/market")).toEqual({ page: "market", tab: "sell" });
    expect(parseRoute("#/market/wallet")).toEqual({ page: "market", tab: "wallet" });
    expect(parseRoute("#/market/pick")).toEqual({ page: "marketPick" });
  });

  it("leaves the dev tools out of the menu", () => {
    expect(section("#/debug")).toBeUndefined();
    expect(section("#/foil")).toBeUndefined();
    expect(section("#/pack-lab")).toBeUndefined();
  });
});
