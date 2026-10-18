"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { currentKitchen, requireUser } from "@/lib/session";
import { switchKitchen } from "@/app/kitchens/actions";
import { createKitchen } from "@/lib/kitchens";
import { cleanSlots, setSlots } from "@/lib/plan";

export interface WelcomeResult {
  ok: boolean;
  error?: string;
  message?: string;
}

/**
 * Being shown round, one answer at a time.
 *
 * Every step here is skippable and none of it asks for anything the app could
 * work out later. That is the whole design: an onboarding that gates the app
 * behind a form is a signup form wearing a coat, and the thing it is trying to
 * fix - opening the app onto empty screens with no idea what to do - is not
 * fixed by making the empty screens harder to reach.
 */

/** Step one, and the only one with nothing sensible to fall back on. */
export async function nameKitchen(name: string): Promise<WelcomeResult> {
  const session = await requireUser();
  if (!session.ok) return { ok: false, error: "Sign in first." };

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Give it a name." };

  /**
   * createKitchen, not the makeKitchen action.
   *
   * They do the same work, but the action ends in redirect("/kitchens") -
   * which is right when a kitchen is made from the kitchens page and wrong
   * here, where it threw somebody two steps into being shown round onto the
   * admin screen. A server action's redirect is the client's redirect; there
   * is no catching it from the caller's side.
   *
   * The shared half is lib/kitchens, so the kitchen is still identical in
   * every respect that matters: ownership and membership.
   */
  const kitchen = await createKitchen(session.user.id, trimmed);
  await switchKitchen(kitchen.id);

  revalidatePath("/welcome");
  return { ok: true };
}

/** Step two: how this household eats. */
export async function howYouCook(
  slots: string[],
  servings: number,
): Promise<WelcomeResult> {
  const context = await currentKitchen();
  if (!context.ok) return { ok: false, error: "Sign in first." };
  if (!context.kitchen) return { ok: false, error: "Make a kitchen first." };

  await setSlots(context.kitchen.id, cleanSlots(slots));

  const howMany = Number(servings);
  if (Number.isInteger(howMany) && howMany > 0 && howMany <= 20) {
    await getDb().execute({
      sql: "UPDATE kitchens SET default_servings = ? WHERE id = ?",
      args: [howMany, context.kitchen.id],
    });
  }

  revalidatePath("/plan");
  return { ok: true };
}

/** Stops it being offered again. Called by Finish and by Skip alike. */
export async function finishWelcome(): Promise<WelcomeResult> {
  const session = await requireUser();
  if (!session.ok) return { ok: false, error: "Sign in first." };

  await getDb().execute({
    sql: "UPDATE users SET onboarded_at = CURRENT_TIMESTAMP WHERE id = ?",
    args: [session.user.id],
  });

  revalidatePath("/recipes");
  return { ok: true };
}
