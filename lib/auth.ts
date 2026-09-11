import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Credential checking and session-cookie signing, shared by the proxy and the
 * login action.
 *
 * Sessions are signed with PANTRY_SESSION_SECRET, falling back to
 * PANTRY_PASSWORD so an existing deployment keeps working without a new env
 * var. Signing rather than looking anything up matters: the proxy runs on every
 * request and the database is a network hop away on another continent's worth
 * of latency, so a cookie that can be checked with arithmetic alone is the
 * difference between a fast app and a slow one.
 *
 * Nothing here touches the database. User rows live in lib/users.ts, and
 * lib/session.ts joins the two.
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

/** Falls back to the password so a deployment without the new var still works. */
function sessionSecret(): string | null {
  return process.env.PANTRY_SESSION_SECRET || configuredPassword();
}

/**
 * `v2.<userId>.<expiry>.<signature>`.
 *
 * The version prefix is inside the signed message, so a v1 cookie from before
 * accounts existed can't be replayed as a v2 one. In practice v1 cookies simply
 * stop verifying, and everyone signs in once more.
 */
export function mintSession(userId: number): { value: string; maxAge: number } | null {
  const secret = sessionSecret();
  if (!secret) return null;

  const maxAge = SESSION_DAYS * 86400;
  const expiry = Math.floor(Date.now() / 1000) + maxAge;
  const body = `v2.${userId}.${expiry}`;

  return { value: `${body}.${sign(body, secret)}`, maxAge };
}

/**
 * The user id a cookie vouches for, or null.
 *
 * Only says the cookie is authentic and current - not that the user still
 * exists. Callers that need the row look it up; the proxy deliberately doesn't,
 * because a database round trip per request is not worth paying to catch the
 * rare case of a deleted account with a live session.
 */
export function sessionUserId(cookie: string | undefined): number | null {
  const secret = sessionSecret();
  if (!secret || !cookie) return null;

  const parts = cookie.split(".");
  if (parts.length !== 4 || parts[0] !== "v2") return null;

  const [, rawUserId, rawExpiry, signature] = parts;

  const userId = Number(rawUserId);
  const expiry = Number(rawExpiry);
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  if (!Number.isSafeInteger(expiry) || expiry <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  if (!matches(signature, sign(`v2.${userId}.${expiry}`, secret))) return null;
  return userId;
}

/** Pulls the token out of an `Authorization: Bearer` header, if there is one. */
export function bearerToken(header: string | null): string | null {
  const [scheme, token] = (header ?? "").split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

/**
 * The back door.
 *
 * Basic auth against PANTRY_USER and PANTRY_PASSWORD, unchanged from before
 * accounts existed, and unrelated to the users table. It's what gets you back
 * in if a migration leaves nobody able to sign in. Drop it once accounts have
 * proven themselves.
 */
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
