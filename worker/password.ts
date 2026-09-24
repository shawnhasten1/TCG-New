// Password hashing with PBKDF2-SHA256 from Web Crypto. Workers cap PBKDF2 at 100,000 iterations.
// The iteration count is stored with each hash, so it can be raised later without breaking old ones.

import { base64url, fromBase64url } from "./http";

const ALG = "pbkdf2-sha256";
const ITERATIONS = 100_000;

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return [ALG, ITERATIONS, base64url(salt), base64url(await derive(password, salt, ITERATIONS))].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, iter, salt, hash] = stored.split("$");
  const iterations = Number(iter);
  if (alg !== ALG || !Number.isInteger(iterations) || iterations < 1 || iterations > ITERATIONS || !salt || !hash) return false;
  const got = await derive(password, fromBase64url(salt), iterations);
  const want = fromBase64url(hash);
  // Constant-time compare.
  let diff = got.length ^ want.length;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ (want[i] ?? 0);
  return diff === 0;
}

/** Spends the same time as a real check, so "no such account" can't be told apart by timing. */
export async function dummyVerify(password: string): Promise<void> {
  await derive(password, new Uint8Array(16), ITERATIONS);
}

export const MIN_PASSWORD = 8;
const MAX_PASSWORD = 256;

/** A readable problem with a new password, or undefined if it's fine. */
export function passwordProblem(password: unknown): string | undefined {
  if (typeof password !== "string" || password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters for your password.`;
  if (password.length > MAX_PASSWORD) return "That password is too long.";
  return undefined;
}
