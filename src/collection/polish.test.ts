import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { parseBackup, planMerge, toBackup, type StoredPull } from "./backup";
import { formatCountdown, localDay, nextReset, packAllowance, packsOpenedOn } from "./daily";
import { addPulls, clearPulls, getPulls } from "./store";

const pull = (packId: string, openedAt: string, cardId = "s-1"): StoredPull => ({
  packId,
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

  describe("allowance", () => {
    const at = (h: number, m = 0, s = 0) => new Date(2026, 8, 23, h, m, s);
    const packs = (...times: Date[]) => times.map((t, i) => pull(`p${i}`, t.toISOString()));

    it("treats a limit of 0 as unlimited", () => {
      expect(packAllowance(packs(at(9), at(9, 1)), 0, at(10))).toEqual({ left: Infinity });
    });

    it("counts down from the limit without recharging while packs remain", () => {
      expect(packAllowance(packs(at(9), at(9, 5)), 3, at(12))).toEqual({ left: 1 });
    });

    it("counts a pack once however many cards it has, and ignores other days", () => {
      const pulls = [...packs(at(9)), pull("p0", at(9).toISOString(), "s-2"), pull("old", new Date(2026, 8, 22, 23).toISOString())];
      expect(packAllowance(pulls, 3, at(10)).left).toBe(2);
    });

    it("recharges one pack every two minutes after running out", () => {
      const pulls = packs(at(9), at(9, 1), at(9, 2));
      expect(packAllowance(pulls, 3, at(9, 3))).toEqual({ left: 0, nextAt: at(9, 4) });
      expect(packAllowance(pulls, 3, at(9, 4))).toEqual({ left: 1, nextAt: at(9, 6) });
      expect(packAllowance(pulls, 3, at(9, 7))).toEqual({ left: 2, nextAt: at(9, 8) });
    });

    it("stacks recharged packs up to the limit, then stops the clock", () => {
      const pulls = packs(at(9), at(9, 1), at(9, 2));
      expect(packAllowance(pulls, 3, at(9, 8))).toEqual({ left: 3 }); // three recharges after 9:02
      expect(packAllowance(pulls, 3, at(11))).toEqual({ left: 3 });
    });

    it("keeps partial recharge progress when a recharged pack is opened", () => {
      // Out at 9:02; one back at 9:04, opened at 9:05; the next is still due at 9:06.
      const pulls = packs(at(9), at(9, 1), at(9, 2), at(9, 5));
      expect(packAllowance(pulls, 3, at(9, 5, 30))).toEqual({ left: 0, nextAt: at(9, 6) });
    });

    it("refills at midnight, even mid-recharge", () => {
      const late = [new Date(2026, 8, 23, 23, 59), new Date(2026, 8, 23, 23, 59, 30)];
      expect(packAllowance(packs(...late), 2, new Date(2026, 8, 23, 23, 59, 45))).toEqual({ left: 0, nextAt: new Date(2026, 8, 24) });
      expect(packAllowance(packs(...late), 2, new Date(2026, 8, 24, 0, 0, 1))).toEqual({ left: 2 });
    });
  });

  it("resets at the next local midnight", () => {
    expect(nextReset(new Date(2026, 8, 23, 15, 30))).toEqual(new Date(2026, 8, 24));
    expect(nextReset(new Date(2026, 11, 31, 23, 59))).toEqual(new Date(2027, 0, 1));
  });

  it("formats countdowns", () => {
    expect(formatCountdown((5 * 3600 + 12 * 60 + 5) * 1000)).toBe("5h 12m");
    expect(formatCountdown((12 * 60 + 30) * 1000)).toBe("12m 30s");
    expect(formatCountdown(44_100)).toBe("45s");
    expect(formatCountdown(-5)).toBe("0s");
  });
});

describe("backup", () => {
  const pulls = [pull("a", "2026-09-23T10:00:00.000Z"), pull("a", "2026-09-23T10:00:00.000Z", "s-2"), pull("b", "2026-09-23T11:00:00.000Z")];

  it("round-trips through JSON", () => {
    const text = JSON.stringify(toBackup(pulls.map((p, i) => ({ ...p, id: i + 1 })), new Date("2026-09-23T12:00:00Z")));
    expect(parseBackup(text)).toEqual(pulls);
    expect(text).not.toContain('"id"');
  });

  it("rejects files that aren't backups, with readable errors", () => {
    expect(() => parseBackup("not json")).toThrow(/valid JSON/);
    expect(() => parseBackup('{"app":"other"}')).toThrow(/isn't a Pack Opener backup/);
    expect(() => parseBackup('{"app":"tcg-pack-opener","version":9,"pulls":[]}')).toThrow(/version 9/);
    const bad = { ...toBackup([]), pulls: [{ ...pulls[0], finish: "sparkly" }] };
    expect(() => parseBackup(JSON.stringify(bad))).toThrow(/Pull 1/);
  });

  it("merges by pack, skipping packs already present", () => {
    const plan = planMerge([{ packId: "a" }], pulls);
    expect(plan).toMatchObject({ packsAdded: 1, packsSkipped: 1 });
    expect(plan.toAdd.map((p) => p.packId)).toEqual(["b"]);
  });

  it("imports into the store without duplicating on a second merge", async () => {
    await clearPulls();
    await addPulls(planMerge(await getPulls(), pulls).toAdd);
    await addPulls(planMerge(await getPulls(), pulls).toAdd);
    expect(await getPulls()).toHaveLength(3);
  });
});
