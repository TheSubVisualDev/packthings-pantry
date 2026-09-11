"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  addMember,
  createKitchen,
  deleteKitchen,
  getKitchenFor,
  removeMember,
  renameKitchen,
  setLocations,
  type Role,
} from "@/lib/kitchens";
import { KITCHEN_COOKIE, currentKitchen, requireKitchenRole } from "@/lib/session";
import { requireUser } from "@/lib/session";
import { getUserByHandle, normaliseHandle } from "@/lib/users";

export interface KitchenResult {
  ok: boolean;
  error?: string;
  message?: string;
}

const ROLES: Role[] = ["owner", "editor", "viewer"];

/**
 * Switches which kitchen you're looking at.
 *
 * Membership is checked before the cookie is written, so a hand-edited value
 * never even gets stored - and currentKitchen re-checks on read anyway, because
 * being removed from a kitchen shouldn't wait for your next switch.
 */
export async function switchKitchen(kitchenId: number): Promise<KitchenResult> {
  const session = await requireUser();
  if (!session.ok) return { ok: false, error: "Sign in first." };

  const kitchen = await getKitchenFor(session.user.id, kitchenId);
  if (!kitchen) return { ok: false, error: "You're not in that kitchen." };

  const store = await cookies();
  store.set(KITCHEN_COOKIE, String(kitchenId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 365 * 86400,
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function makeKitchen(
  _previous: KitchenResult,
  formData: FormData,
): Promise<KitchenResult> {
  const session = await requireUser();
  if (!session.ok) return { ok: false, error: "Sign in first." };

  const kitchen = await createKitchen(
    session.user.id,
    String(formData.get("name") ?? ""),
  );

  await switchKitchen(kitchen.id);
  redirect("/kitchens");
}

export async function rename(
  _previous: KitchenResult,
  formData: FormData,
): Promise<KitchenResult> {
  const access = await requireKitchenRole("owner");
  if (!access.ok) return { ok: false, error: access.error };

  await renameKitchen(access.kitchen.id, String(formData.get("name") ?? ""));

  revalidatePath("/", "layout");
  return { ok: true, message: "Renamed." };
}

export async function saveLocations(
  _previous: KitchenResult,
  formData: FormData,
): Promise<KitchenResult> {
  const access = await requireKitchenRole("owner");
  if (!access.ok) return { ok: false, error: access.error };

  // One per line is the least fiddly way to reorder a short list on a phone.
  const names = String(formData.get("locations") ?? "").split("\n");
  await setLocations(access.kitchen.id, names);

  revalidatePath("/kitchens");
  revalidatePath("/pantry");
  return { ok: true, message: "Places updated." };
}

/**
 * Adds someone by handle.
 *
 * By handle rather than by invite link, because this is for people who already
 * have an account - getting *into* the pantry at all is what invites are for.
 */
export async function invite(
  _previous: KitchenResult,
  formData: FormData,
): Promise<KitchenResult> {
  const access = await requireKitchenRole("owner");
  if (!access.ok) return { ok: false, error: access.error };

  const handle = normaliseHandle(String(formData.get("handle") ?? ""));
  const role = String(formData.get("role") ?? "viewer") as Role;

  if (!ROLES.includes(role) || role === "owner") {
    return { ok: false, error: "Pick editor or viewer." };
  }

  const user = await getUserByHandle(handle);
  if (!user) return { ok: false, error: `Nobody here is called @${handle}.` };
  if (user.id === access.user.id) {
    return { ok: false, error: "You're already in this kitchen." };
  }

  await addMember(access.kitchen.id, user.id, role);

  revalidatePath("/kitchens");
  return { ok: true, message: `@${handle} can now ${role === "editor" ? "edit" : "see"} this kitchen.` };
}

export async function removePerson(userId: number): Promise<KitchenResult> {
  const access = await requireKitchenRole("owner");
  if (!access.ok) return { ok: false, error: access.error };

  // removeMember refuses to drop an owner, so a kitchen can't be left with
  // nobody in charge of it.
  await removeMember(access.kitchen.id, userId);

  revalidatePath("/kitchens");
  return { ok: true };
}

/**
 * Deletes a kitchen, and everything that lives in it.
 *
 * Owner only, and the id has to match the one you're actually standing in -
 * so a stale tab can't delete the kitchen you switched to since.
 */
export async function removeKitchen(kitchenId: number): Promise<KitchenResult> {
  const access = await requireKitchenRole("owner");
  if (!access.ok) return { ok: false, error: access.error };
  if (access.kitchen.id !== kitchenId) {
    return { ok: false, error: "That isn't the kitchen you have open." };
  }

  if (!(await deleteKitchen(kitchenId, access.user.id))) {
    return { ok: false, error: "Couldn't delete that." };
  }

  // The cookie still points at what just went. currentKitchen re-checks
  // membership on every read, so it falls through to another of yours or to
  // none - but clearing it now avoids a pointless lookup on every request.
  const store = await cookies();
  store.delete(KITCHEN_COOKIE);

  revalidatePath("/", "layout");
  redirect("/kitchens");
}

/** Leaving is the one thing a viewer or editor can do to their own membership. */
export async function leaveKitchen(kitchenId: number): Promise<KitchenResult> {
  const session = await requireUser();
  if (!session.ok) return { ok: false, error: "Sign in first." };

  const kitchen = await getKitchenFor(session.user.id, kitchenId);
  if (!kitchen) return { ok: false, error: "You're not in that kitchen." };
  if (kitchen.role === "owner") {
    return { ok: false, error: "You own this kitchen, so you can't leave it." };
  }

  await removeMember(kitchenId, session.user.id);

  // Drops you into another of yours, if there is one. If that was your last,
  // you simply have none - which is now a state the app knows how to show.
  const context = await currentKitchen();
  if (context.ok && context.kitchen) await switchKitchen(context.kitchen.id);

  revalidatePath("/", "layout");
  return { ok: true };
}
