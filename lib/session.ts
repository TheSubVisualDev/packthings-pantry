import { cookies } from "next/headers";
import { SESSION_COOKIE, sessionUserId } from "./auth";
import { getUser, type User } from "./users";

/**
 * Who is asking, for server components and actions.
 *
 * The proxy has already refused anyone without a valid session, Basic
 * credentials or an API token, so reaching this at all means authenticated.
 * What it can still return null for is the Basic-auth back door, which is a
 * way in that belongs to no account - pages that need a person handle that
 * case rather than assuming one.
 */
export async function currentUser(): Promise<User | null> {
  const store = await cookies();
  const userId = sessionUserId(store.get(SESSION_COOKIE)?.value);
  if (!userId) return null;

  return getUser(userId);
}

/**
 * The current user, or an explanation of why there isn't one.
 *
 * Throwing would be neater to call but wrong: arriving through the back door
 * is a legitimate state that wants a "sign in properly" prompt, not a 500.
 */
export async function requireUser(): Promise<
  { ok: true; user: User } | { ok: false; reason: "no-session" | "deleted" }
> {
  const store = await cookies();
  const userId = sessionUserId(store.get(SESSION_COOKIE)?.value);
  if (!userId) return { ok: false, reason: "no-session" };

  const user = await getUser(userId);
  // A live cookie for an account that no longer exists. The proxy doesn't
  // check this, deliberately, so it surfaces here instead.
  if (!user) return { ok: false, reason: "deleted" };

  return { ok: true, user };
}
