"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, credentialsValid, mintSession, safeNextPath } from "@/lib/auth";
import { verifyPassword } from "@/lib/passwords";
import { countUsers, createUser, getUserByHandle, redeemInvite } from "@/lib/users";

export interface LoginState {
  error?: string;
}

/** One place that decides how a session cookie is written. */
async function startSession(userId: number): Promise<boolean> {
  const session = mintSession(userId);
  if (!session) return false;

  const store = await cookies();
  store.set(SESSION_COOKIE, session.value, {
    httpOnly: true,
    sameSite: "lax",
    // Local dev is plain http, where a Secure cookie would never be stored.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: session.maxAge,
  });
  return true;
}

/**
 * Signs someone in against their account.
 *
 * The failure message is the same whether the handle is unknown or the
 * password is wrong, so it doesn't confirm who has an account here. An unknown
 * handle still costs a hash: without that, the "no such user" path returns in
 * a millisecond and the difference tells you which handles are real.
 */
export async function login(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const handle = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? ""));

  // Before the first account exists nobody can sign in against the users
  // table, so the env credentials stand in and lead to /setup. This path is
  // only open while there are zero users, which is also the only window in
  // which the env password is the sole credential anyway.
  if ((await countUsers()) === 0) {
    if (!credentialsValid(handle, password)) {
      return { error: "That handle and password didn't match." };
    }
    redirect("/setup");
  }

  const user = await getUserByHandle(handle);

  const stored =
    user?.password_hash ??
    // A real scrypt hash of nothing in particular, so the work happens either
    // way and an unknown handle takes as long as a wrong password.
    "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

  const correct = await verifyPassword(password, stored);

  if (!user || !correct) {
    return { error: "That handle and password didn't match." };
  }

  if (!(await startSession(user.id))) {
    return { error: "Server is missing PANTRY_PASSWORD." };
  }

  redirect(next);
}

export interface RedeemState {
  error?: string;
}

/** Turns an invite code into an account, then signs the new person in. */
export async function acceptInvite(
  _previous: RedeemState,
  formData: FormData,
): Promise<RedeemState> {
  const code = String(formData.get("code") ?? "");
  const handle = String(formData.get("handle") ?? "");
  const displayName = String(formData.get("display_name") ?? "");
  const password = String(formData.get("password") ?? "");

  const result = await redeemInvite(code, handle, displayName, password);
  if (!result.ok || !result.user) {
    return { error: result.error ?? "Couldn't create that account." };
  }

  if (!(await startSession(result.user.id))) {
    return { error: "Account created, but signing in failed. Try the login page." };
  }

  redirect("/pantry");
}

export interface SetupState {
  error?: string;
}

/**
 * Creates the very first account.
 *
 * Refuses once anyone exists, so it can't be used to mint a second owner. The
 * page is behind the proxy's gate like everything else, so reaching it at all
 * means holding the deployment's password.
 */
export async function createFirstUser(
  _previous: SetupState,
  formData: FormData,
): Promise<SetupState> {
  if ((await countUsers()) > 0) {
    return { error: "There's already an account here. Sign in instead." };
  }

  const handle = String(formData.get("handle") ?? "");
  const displayName = String(formData.get("display_name") ?? "");
  const password = String(formData.get("password") ?? "");

  if (password.length < 10) {
    return { error: "Use a password of at least 10 characters." };
  }

  const user = await createUser(handle, displayName, password);
  if (!(await startSession(user.id))) {
    return { error: "Account created, but signing in failed. Try the login page." };
  }

  redirect("/pantry");
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
