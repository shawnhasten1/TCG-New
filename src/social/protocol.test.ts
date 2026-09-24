import { describe, expect, it } from "vitest";
import { CODE_ALPHABET, formatFriendCode, normalizeFriendCode, parseDisplayName, parseSlots } from "./protocol";

describe("friend codes", () => {
  it("has 32 unambiguous characters", () => {
    expect(CODE_ALPHABET).toHaveLength(32);
    expect(new Set(CODE_ALPHABET).size).toBe(32);
    for (const c of "01OI") expect(CODE_ALPHABET).not.toContain(c);
  });

  it("accepts codes however they're typed", () => {
    expect(normalizeFriendCode("K7QX3M9P")).toBe("K7QX3M9P");
    expect(normalizeFriendCode("k7qx-3m9p")).toBe("K7QX3M9P");
    expect(normalizeFriendCode(" K7QX 3M9P ")).toBe("K7QX3M9P");
    expect(formatFriendCode("K7QX3M9P")).toBe("K7QX-3M9P");
  });

  it("rejects anything that can't be a code", () => {
    expect(normalizeFriendCode("K7QX3M9")).toBeUndefined();
    expect(normalizeFriendCode("K7QX3M9PP")).toBeUndefined();
    expect(normalizeFriendCode("K7QX3M90")).toBeUndefined();
    expect(normalizeFriendCode("K7QX3M9!")).toBeUndefined();
    expect(normalizeFriendCode(12345678)).toBeUndefined();
  });
});

describe("display names", () => {
  it("tidies whitespace and invisible characters", () => {
    expect(parseDisplayName("  Ash   Ketchum ")).toBe("Ash Ketchum");
    expect(parseDisplayName("Mi\u200bsty\u0007")).toBe("Misty");
  });

  it("counts characters, not UTF-16 units", () => {
    expect(parseDisplayName("🔥".repeat(24))).toHaveLength(48);
    expect(() => parseDisplayName("🔥".repeat(25))).toThrow();
  });

  it("refuses names that are too short or too long", () => {
    expect(() => parseDisplayName("A")).toThrow(/at least/);
    expect(() => parseDisplayName("   ")).toThrow();
    expect(() => parseDisplayName(undefined)).toThrow();
    expect(() => parseDisplayName("x".repeat(25))).toThrow(/24/);
  });
});

describe("share slots", () => {
  it("sorts and de-duplicates positions in the pack", () => {
    expect(parseSlots([9, 0, 9, 3], 10)).toEqual([0, 3, 9]);
  });

  it("refuses nothing, too many, or positions outside the pack", () => {
    expect(() => parseSlots([], 10)).toThrow();
    expect(() => parseSlots(undefined, 10)).toThrow();
    expect(() => parseSlots(Array.from({ length: 21 }, (_, i) => i), 30)).toThrow();
    expect(() => parseSlots([10], 10)).toThrow(/aren't in that pack/);
    expect(() => parseSlots([-1], 10)).toThrow();
    expect(() => parseSlots([1.5], 10)).toThrow();
    expect(() => parseSlots(["1"], 10)).toThrow();
  });
});
