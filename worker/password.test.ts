import { describe, expect, it } from "vitest";
import { hashPassword, passwordProblem, verifyPassword } from "./password";

describe("passwords", () => {
  it("verifies the right password and rejects others", async () => {
    const stored = await hashPassword("correct horse");
    expect(stored).toMatch(/^pbkdf2-sha256\$100000\$/);
    expect(await verifyPassword("correct horse", stored)).toBe(true);
    expect(await verifyPassword("correct horsE", stored)).toBe(false);
    expect(await hashPassword("correct horse")).not.toBe(stored);
  });

  it("rejects malformed stored hashes", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "md5$1$a$b")).toBe(false);
    expect(await verifyPassword("x", "pbkdf2-sha256$99999999$a$b")).toBe(false);
  });

  it("asks for a reasonable length", () => {
    expect(passwordProblem("short")).toBeTruthy();
    expect(passwordProblem(undefined)).toBeTruthy();
    expect(passwordProblem("long enough")).toBeUndefined();
  });
});
