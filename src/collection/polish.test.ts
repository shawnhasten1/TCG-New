import { describe, expect, it } from "vitest";
import { toBackup, type StoredPull } from "./backup";
import { formatCountdown, localDay, packsOpenedOn } from "./daily";

const pull = (packId: string, openedAt: string, cardId = "s-1"): StoredPull => ({
  packId,
  slot: 0,
  setId: "s",
  cardId,
  localId: "1",
  finish: "normal",
  firstEdition: false,
  openedAt,
});

describe("daily packs", () => {
  it("counts distinct packs opened on a local day", () => {
    const today = new Date(2026, 8, 23, 15, 0);
    const pulls = [
      pull("a", new Date(2026, 8, 23, 9).toISOString()),
      pull("a", new Date(2026, 8, 23, 9).toISOString(), "s-2"),
      pull("b", new Date(2026, 8, 23, 23, 59).toISOString()),
      pull("c", new Date(2026, 8, 22, 23, 59).toISOString()),
    ];
    expect(packsOpenedOn(pulls, localDay(today))).toBe(2);
  });

  it("formats countdowns", () => {
    expect(formatCountdown((5 * 3600 + 12 * 60 + 5) * 1000)).toBe("5h 12m");
    expect(formatCountdown((12 * 60 + 30) * 1000)).toBe("12m 30s");
    expect(formatCountdown(44_100)).toBe("45s");
    expect(formatCountdown(-5)).toBe("0s");
  });
});

describe("backup", () => {
  it("exports pulls without their local ids", () => {
    const pulls = [pull("a", "2026-09-23T10:00:00.000Z"), pull("b", "2026-09-23T11:00:00.000Z")];
    const backup = toBackup(pulls.map((p, i) => ({ ...p, id: i + 1 })), new Date("2026-09-23T12:00:00Z"));
    expect(backup).toMatchObject({ app: "tcg-pack-opener", version: 1, exportedAt: "2026-09-23T12:00:00.000Z" });
    expect(backup.pulls).toEqual(pulls);
  });
});
