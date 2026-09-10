import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Credential checking and session-cookie signing, shared by the proxy and the
 * login action.
 *
 * The signing key is derived from PANTRY_PASSWORD rather than being its own
 * env var: one less thing to set in Vercel, and changing the password then
 * invalidates every outstanding session, which is what you want from a
 * password change anyway.
 */

export const SESSION_COOKIE = "pantry_session";

/** Long enough that the phone doesn't ask again every week. */
export const SESSION_DAYS = 30;

/** Compares through digests: constant time, and unequal lengths don't throw. */
function matches(candidate: string, expected: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(candidate).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

export function expectedUser(): string {
  return process.env.PANTRY_USER ?? "pantry";
}

/** Null when PANTRY_PASSWORD is unset, which every caller must treat as "deny". */
export function configuredPassword(): string | null {
  return process.env.PANTRY_PASSWORD || null;
}

export function credentialsValid(user: string, password: string): boolean {
  const expected = configuredPassword();
  if (!expected) return false;

  // Both comparisons run unconditionally: with `&&` inline, a wrong username
  // would skip the password check and return measurably faster.
  const userOk = matches(user, expectedUser());
  const passwordOk = matches(password, expected);
  return userOk && passwordOk;
}

function sign(message: string, secret: string): string {
  return createHmac("sha256", secret).update(message).digest("base64url");
}

/** `<expiry>.<signature>`, where the signature also covers the username. */
export function mintSession(): { value: string; maxAge: number } | null {
  const secret = configuredPassword();
  if (!secret) return null;

  const maxAge = SESSION_DAYS * 86400;
  const expiry = Math.floor(Date.now() / 1000) + maxAge;
  const message = `v1.${expectedUser()}.${expiry}`;

  return { value: `${expiry}.${sign(message, secret)}`, maxAge };
}

export function sessionValid(cookie: string | undefined): boolean {
  const secret = configuredPassword();
  if (!secret || !cookie) return false;

  const separator = cookie.indexOf(".");
  if (separator === -1) return false;

  const expiry = Number(cookie.slice(0, separator));
  if (!Number.isSafeInteger(expiry) || expiry <= Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expected = sign(`v1.${expectedUser()}.${expiry}`, secret);
  return matches(cookie.slice(separator + 1), expected);
}

/** Parses an `Authorization: Basic` header. Kept for non-interactive callers. */
export function basicAuthValid(header: string | null): boolean {
  const [scheme, encoded] = (header ?? "").split(" ");
  if (scheme?.toLowerCase() !== "basic" || !encoded) return false;

  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator === -1) return false;

  return credentialsValid(decoded.slice(0, separator), decoded.slice(separator + 1));
}

/**
 * Only same-origin absolute paths survive, so `?next=` can't be used to bounce
 * someone off to another site after a successful login.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/pantry";
  return value;
}
