import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { promisify } from "node:util";

/**
 * Password hashing with scrypt.
 *
 * Node's own, no dependency, the same reasoning as scripts/gen-token.mjs
 * signing Ed25519 with built-ins. scrypt is deliberately memory-hard, so a
 * stolen hash is expensive to attack with the GPUs that make short work of
 * anything based on a plain digest.
 *
 * The async form, not scryptSync: at these parameters it takes long enough
 * that blocking the event loop on every sign-in would be felt.
 */

// promisify picks the overload without options, which is the one we don't
// want - the parameters are the whole point.
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * N=16384 needs 128 * N * r bytes, so 16MB, which sits under Node's 32MB
 * default cap. The parameters are stored in the hash rather than assumed, so
 * raising them later doesn't invalidate existing passwords.
 */
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

/** `scrypt$N$r$p$salt$hash`, all base64url. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEY_LENGTH, { N, r: R, p: P });

  return [
    "scrypt",
    N,
    R,
    P,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

/**
 * Constant-time verify. Returns false rather than throwing on a malformed
 * stored value: a corrupted row should refuse the login, not crash it.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, n, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, "base64url");
  const expected = Buffer.from(hashB64, "base64url");

  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const key = await scryptAsync(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });

    return timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

/** A key for the Claude endpoint. 32 bytes, so guessing is not a strategy. */
export function newApiToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * An invite code. Shorter than an API token because it gets typed or pasted
 * into a chat, and it dies on first use and on a deadline - 80 bits is plenty
 * for something with both of those.
 */
export function newInviteCode(): string {
  return randomBytes(10).toString("base64url");
}
