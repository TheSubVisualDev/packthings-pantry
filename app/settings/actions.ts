"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { verifyPassword } from "@/lib/passwords";
import {
  createInvite,
  revokeInvite,
  rotateApiToken,
  setPassword,
  updateProfile,
} from "@/lib/users";

export interface ActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

/**
 * Every action here re-reads the session rather than trusting an id from the
 * form. A user id in a form field is a user id someone can edit.
 */
async function signedIn() {
  const result = await requireUser();
  return result.ok ? result.user : null;
}

export async function newInvite(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await signedIn();
  if (!user) return { ok: false, error: "Sign in first." };

  const invite = await createInvite(user.id, String(formData.get("note") ?? ""));

  revalidatePath("/settings");
  return { ok: true, message: `Invite ready: ${invite.code}` };
}

export async function dropInvite(code: string): Promise<ActionResult> {
  const user = await signedIn();
  if (!user) return { ok: false, error: "Sign in first." };

  // Scoped to the creator inside the query, so a code guessed from elsewhere
  // can't be revoked by someone who didn't issue it.
  await revokeInvite(code, user.id);

  revalidatePath("/settings");
  return { ok: true };
}

export async function newApiKey(): Promise<ActionResult> {
  const user = await signedIn();
  if (!user) return { ok: false, error: "Sign in first." };

  await rotateApiToken(user.id);

  revalidatePath("/settings");
  revalidatePath("/claude");
  return { ok: true, message: "New key issued. The old one stopped working." };
}

export async function saveProfile(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await signedIn();
  if (!user) return { ok: false, error: "Sign in first." };

  const result = await updateProfile(user.id, {
    displayName: String(formData.get("display_name") ?? ""),
    handle: String(formData.get("handle") ?? ""),
  });

  if (!result.ok) return { ok: false, error: result.error };

  // The handle is in the header, on every byline and in the URL of your own
  // profile, so the whole tree is stale after this.
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}

/**
 * Changing a password needs the current one, so a borrowed unlocked phone
 * can't be used to lock its owner out.
 */
export async function changePassword(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await signedIn();
  if (!user) return { ok: false, error: "Sign in first." };

  const current = String(formData.get("current_password") ?? "");
  const next = String(formData.get("new_password") ?? "");

  if (!(await verifyPassword(current, user.password_hash))) {
    return { ok: false, error: "That isn't your current password." };
  }
  if (next.length < 10) {
    return { ok: false, error: "Use a password of at least 10 characters." };
  }

  await setPassword(user.id, next);

  // Sessions are signed with a server secret, not the password, so existing
  // sessions survive this. That's the right call for a shared household phone
  // still being logged in, and it's why the current password is required above.
  return { ok: true, message: "Password changed." };
}
