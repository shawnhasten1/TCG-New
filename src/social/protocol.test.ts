import { describe, expect, it } from "vitest";
import { CODE_ALPHABET, formatFriendCode, isReaction, MAX_COMMENT, normalizeFriendCode, parseCommentText, parseDisplayName, parseSlots, parseTradeSide } from "./protocol";

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

describe("trade offers", () => {
  const isUid = (s: unknown) => typeof s === "string" && s.includes(":");

  it("takes each card once, and treats a missing side as empty", () => {
    expect(parseTradeSide(["p:1", "p:1", "p:2"], isUid)).toEqual(["p:1", "p:2"]);
    expect(parseTradeSide(undefined, isUid)).toEqual([]);
  });

  it("refuses too many cards or things that aren't card ids", () => {
    expect(() => parseTradeSide(Array.from({ length: 11 }, (_, i) => `p:${i}`), isUid)).toThrow(/up to 10/);
    expect(() => parseTradeSide(["nope"], isUid)).toThrow();
    expect(() => parseTradeSide("p:1", isUid)).toThrow();
  });
});

describe("reactions", () => {
  it("knows the reactions on offer", () => {
    for (const k of ["like", "dislike", "fire", "wow", "laugh"]) expect(isReaction(k)).toBe(true);
    for (const k of ["love", "", null, 1]) expect(isReaction(k)).toBe(false);
  });
});

describe("comments", () => {
  it("tidies whitespace and control characters", () => {
    expect(parseCommentText("  nice   pull!\n\nwow ")).toBe("nice pull! wow");
    expect(parseCommentText("a\u0007b‮c")).toBe("a b c");
  });

  it("keeps emoji whole", () => {
    const family = "\u{1F468}‍\u{1F469}‍\u{1F467}";
    expect(parseCommentText(`${family} \u{1F525}`)).toBe(`${family} \u{1F525}`);
  });

  it("rejects empty and overlong comments", () => {
    expect(() => parseCommentText("   ")).toThrow();
    expect(() => parseCommentText(42)).toThrow();
    expect(parseCommentText("\u{1F525}".repeat(MAX_COMMENT))).toHaveLength(MAX_COMMENT * 2);
    expect(() => parseCommentText("a".repeat(MAX_COMMENT + 1))).toThrow();
  });
});
