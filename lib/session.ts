import { cookies } from "next/headers";
import { SESSION_COOKIE, bearerToken, sessionUserId } from "./auth";
import {
  atLeast,
  currentKitchenFor,
  getKitchenFor,
  type KitchenMembership,
  type Role,
} from "./kitchens";
import { getUser, getUserByApiToken, type User } from "./users";

/** Which kitchen you were last looking at. A preference, not a permission. */
export const KITCHEN_COOKIE = "pantry_kitchen";

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

/**
 * The kitchen this request is about, and what the person may do in it.
 *
 * The cookie is a preference, never an authorisation: the id in it is looked up
 * through the membership table, so pointing it at someone else's kitchen simply
 * falls back to one of your own.
 */
export async function currentKitchen(): Promise<
  { ok: true; user: User; kitchen: KitchenMembership | null } | { ok: false }
> {
  const session = await requireUser();
  if (!session.ok) return { ok: false };

  const store = await cookies();
  const wanted = Number(store.get(KITCHEN_COOKIE)?.value);

  if (Number.isSafeInteger(wanted) && wanted > 0) {
    const chosen = await getKitchenFor(session.user.id, wanted);
    if (chosen) return { ok: true, user: session.user, kitchen: chosen };
  }

  return {
    ok: true,
    user: session.user,
    kitchen: await currentKitchenFor(session.user.id),
  };
}

/** For writes: refuses when the role isn't high enough. */
export async function requireKitchenRole(
  needed: Role,
): Promise<{ ok: true; user: User; kitchen: KitchenMembership } | { ok: false; error: string }> {
  const context = await currentKitchen();
  if (!context.ok) return { ok: false, error: "Sign in first." };
  if (!context.kitchen) {
    return { ok: false, error: "You don't have a kitchen yet. Make one first." };
  }

  if (!atLeast(context.kitchen.role, needed)) {
    return {
      ok: false,
      error:
        context.kitchen.role === "viewer"
          ? `You can look at ${context.kitchen.name}, but not change it.`
          : "You don't have permission to do that.",
    };
  }

  return { ok: true, user: context.user, kitchen: context.kitchen };
}

/**
 * Who an API request is, and which kitchen it acts on.
 *
 * A bearer token identifies its owner directly; a browser hitting the same
 * route falls back to the session cookie. The proxy has already refused
 * anything with neither, so this is about *which* person, not whether.
 *
 * The kitchen is the caller's default one. There's no way to choose another
 * over the API yet - a header for it can come when something needs it.
 */
export async function apiContext(
  request: Request,
): Promise<
  { ok: true; user: User; kitchen: KitchenMembership | null } | { ok: false }
> {
  const token = bearerToken(request.headers.get("authorization"));

  if (token) {
    const user = await getUserByApiToken(token);
    if (user) {
      return { ok: true, user, kitchen: await currentKitchenFor(user.id) };
    }
  }

  const context = await currentKitchen();
  return context.ok ? context : { ok: false };
}
