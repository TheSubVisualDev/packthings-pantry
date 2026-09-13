"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { currentKitchen, requireUser } from "@/lib/session";
import { switchKitchen } from "@/app/kitchens/actions";
import { createKitchen } from "@/lib/kitchens";
import { cleanSlots, setSlots } from "@/lib/plan";
import { CANONICAL_FOR } from "@/lib/units";

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
 * fix - opening the pantry onto empty shelves with no idea what to do - is not
 * fixed by making the empty shelves harder to reach.
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
   * every respect that matters: ownership, membership, the places it starts
   * with.
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

/**
 * The staples you certainly have and would never think to add.
 *
 * Added as `unspecified`, which is the column for "there is some and nobody
 * has said how much" - and is exactly true of the salt. Asking somebody to
 * weigh their salt on their first minute in the app would be the fastest way
 * to lose them, and inventing a number would be worse: it would be wrong on
 * the shelf for ever and nobody would know why.
 */
export async function addStaples(names: string[]): Promise<WelcomeResult> {
  const context = await currentKitchen();
  if (!context.ok) return { ok: false, error: "Sign in first." };
  if (!context.kitchen) return { ok: false, error: "Make a kitchen first." };

  const wanted = [...new Set(names.map((name) => name.trim()).filter(Boolean))]
    .slice(0, 30);
  if (wanted.length === 0) return { ok: true, message: "Nothing added." };

  // What is already there, so running this twice does not double the shelf.
  const existing = await getDb().execute({
    sql: "SELECT LOWER(name) AS name FROM items WHERE kitchen_id = ?",
    args: [context.kitchen.id],
  });
  const have = new Set(
    (existing.rows as unknown as { name: string }[]).map((row) => row.name),
  );

  let added = 0;
  for (const name of wanted) {
    if (have.has(name.toLowerCase())) continue;

    await getDb().execute({
      sql: `INSERT INTO items
              (kitchen_id, name, quantity, canonical_unit, dimension, unspecified)
            VALUES (?, ?, 0, ?, 'mass', 1)`,
      args: [context.kitchen.id, name, CANONICAL_FOR.mass],
    });
    added += 1;
  }

  revalidatePath("/pantry");
  return {
    ok: true,
    message: `${added} added. You can say how much whenever you like.`,
  };
}

/** Stops it being offered again. Called by Finish and by Skip alike. */
export async function finishWelcome(): Promise<WelcomeResult> {
  const session = await requireUser();
  if (!session.ok) return { ok: false, error: "Sign in first." };

  await getDb().execute({
    sql: "UPDATE users SET onboarded_at = CURRENT_TIMESTAMP WHERE id = ?",
    args: [session.user.id],
  });

  revalidatePath("/pantry");
  return { ok: true };
}
