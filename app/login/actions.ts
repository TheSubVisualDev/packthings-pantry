"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE,
  credentialsValid,
  mintSession,
  safeNextPath,
} from "@/lib/auth";

export interface LoginState {
  error?: string;
}

/**
 * Checks the submitted credentials and, on success, sets the session cookie.
 *
 * The failure message is deliberately the same for a wrong username and a
 * wrong password, so it doesn't confirm which half was right.
 */
export async function login(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? ""));

  if (!credentialsValid(username, password)) {
    return { error: "That username and password didn't match." };
  }

  const session = mintSession();
  if (!session) return { error: "Server is missing PANTRY_PASSWORD." };

  const store = await cookies();
  store.set(SESSION_COOKIE, session.value, {
    httpOnly: true,
    sameSite: "lax",
    // Local dev is plain http, where a Secure cookie would never be stored.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: session.maxAge,
  });

  redirect(next);
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
