import { describe, expect, it } from "vitest";
import { packAllowance, RECHARGE_MS } from "./protocol";

const MIN = 60_000;
const t0 = Date.UTC(2026, 8, 24, 9);
const at = (min: number, sec = 0) => t0 + min * MIN + sec * 1000;

describe("pack allowance", () => {
  it("starts full", () => {
    expect(packAllowance([], at(0), 3)).toEqual({ left: 3, limit: 3, nextAt: null });
  });

  it("recharges one pack every two minutes once below the limit", () => {
    expect(RECHARGE_MS).toBe(2 * MIN);
    const opened = [at(0), at(1)];
    expect(packAllowance(opened, at(1, 30), 3)).toEqual({ left: 1, limit: 3, nextAt: at(2) });
    expect(packAllowance(opened, at(2), 3)).toEqual({ left: 2, limit: 3, nextAt: at(4) });
    expect(packAllowance(opened, at(4), 3)).toEqual({ left: 3, limit: 3, nextAt: null });
  });

  it("never goes below zero or above the limit", () => {
    const burst = [at(0), at(0), at(0), at(0), at(0)];
    expect(packAllowance(burst, at(0, 10), 3).left).toBe(0);
    expect(packAllowance(burst, at(60), 3).left).toBe(3);
  });

  it("keeps partial recharge progress when a recharged pack is opened", () => {
    // Packs come back at 0:02 and 0:04 (charging from 0:00); one is opened at 0:05, and the next is still due at 0:06.
    const opened = [at(0), at(1), at(2), at(5)];
    expect(packAllowance(opened, at(5, 30), 3)).toEqual({ left: 1, limit: 3, nextAt: at(6) });
  });

  it("ignores opens after now, and takes them in any order", () => {
    expect(packAllowance([at(1), at(0), at(30)], at(1, 30), 3)).toEqual(packAllowance([at(0), at(1)], at(1, 30), 3));
  });
});
