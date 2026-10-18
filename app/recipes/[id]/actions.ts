"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireKitchenRole, requireUser } from "@/lib/session";
import { getRecipe } from "@/lib/queries";
import { rate } from "@/lib/recipe-store";
import { addToCookbook, isInCookbook } from "@/lib/cookbook";
import { record } from "@/lib/usage";
import { forgetCook, record as tellAuthor } from "@/lib/notifications";
import type { CookEvent, Recipe } from "@/lib/types";

export interface CookResult {
  ok: boolean;
  error?: string;
  /** Row in cook_events, and the handle undo needs. */
  eventId?: number;
  /** What was cooked, for anything that has to say so afterwards. */
  recipeName?: string;
}

/**
 * Says a recipe was cooked, at a serving count.
 *
 * Until v2 this was the heaviest write in the app: every line resolved to a
 * stock row, converted, scaled and taken off the shelf through the container
 * rule, all in one transaction. v2 removed stock tracking on 18 Oct 2026 - the
 * shelf was the thing nobody kept up to date, so every number it subtracted
 * from was already wrong (docs/ROADMAP-V2.md). What is left is the part that
 * was always true: somebody cooked this, for this many, on this day. That is
 * what the cooked log, the planner's "had it recently", the author's
 * notification and times_cooked all read.
 *
 * `changes` is written as an empty list. The column is NOT NULL and its rows
 * from before v2 still hold the old deltas, which nothing reads now.
 */
export async function cookRecipe(
  recipeId: number,
  servings: number,
): Promise<CookResult> {
  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    return { ok: false, error: "Invalid recipe" };
  }
  if (!Number.isFinite(servings) || servings <= 0 || servings > 100) {
    return { ok: false, error: "Invalid serving count" };
  }

  // A cook is a fact about a kitchen - it goes in that kitchen's log - so it
  // needs a kitchen the person may change.
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  /**
   * Cooking a recipe adopts it, rather than requiring that first.
   *
   * The Cook button used to appear only once a recipe was in the cookbook,
   * and in a month of counting recipes were cooked zero times with zero
   * presses of Add to cookbook - the app's central action gated on a word
   * nobody had reason to learn. Not counted as `recipe.save`: that name means
   * the button was pressed.
   */
  if (!(await isInCookbook(access.kitchen.id, recipeId))) {
    await addToCookbook(access.kitchen.id, recipeId, access.user.id);
  }

  const tx = await getDb().transaction("write");

  try {
    const recipeResult = await tx.execute({
      sql: "SELECT * FROM recipes WHERE id = ?",
      args: [recipeId],
    });
    const recipe = recipeResult.rows[0] as unknown as Recipe | undefined;
    if (!recipe) {
      await tx.rollback();
      return { ok: false, error: "Recipe not found" };
    }

    await tx.execute({
      sql: "UPDATE recipes SET times_cooked = times_cooked + 1 WHERE id = ?",
      args: [recipeId],
    });

    const event = await tx.execute({
      sql: `INSERT INTO cook_events (kitchen_id, cooked_by, recipe_id, servings, changes, skipped)
            VALUES (?, ?, ?, ?, '[]', NULL)`,
      // skipped stays NULL. It recorded the lines unticked on the "came off
      // your shelves" checklist, and that checklist went with the shelves.
      // Old rows that have it are still shown in the log.
      args: [access.kitchen.id, access.user.id, recipeId, servings],
    });

    await tx.commit();

    // After the commit, not before: a cook that rolled back did not happen,
    // and a count of attempts is a different question nobody asked.
    record("cook.start", access.user.id, `/recipes/${recipeId}`);

    /**
     * Tell whoever wrote it, if it was not this person.
     *
     * Also after the commit, and for a stronger reason than the count: this
     * one leaves the building. A push sent for a cook that then rolled back
     * cannot be taken back out of somebody's pocket.
     */
    if (event.lastInsertRowid) {
      tellAuthor({
        cookEventId: Number(event.lastInsertRowid),
        recipeId,
        cookId: access.user.id,
        recipeName: recipe.name,
        cookHandle: access.user.handle,
      });
    }

    revalidatePath("/recipes");
    revalidatePath(`/recipes/${recipeId}`);
    revalidatePath("/cooked");

    return {
      ok: true,
      recipeName: recipe.name,
      eventId: event.lastInsertRowid ? Number(event.lastInsertRowid) : undefined,
    };
  } catch (error) {
    await tx.rollback();
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Cook failed",
    };
  }
}

/**
 * Your own rating, not the household's.
 *
 * A single shared number couldn't survive more than one person having an
 * opinion, so ratings moved to their own table keyed by who left them. The
 * average across everyone is what a listing shows.
 */
export async function rateRecipe(
  recipeId: number,
  rating: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: "Rating must be 1-5" };
  }

  const session = await requireUser();
  if (!session.ok) return { ok: false, error: "Sign in first." };

  // Only recipes you can see can be rated, so a number can't be attached to
  // somebody's private recipe by guessing its id.
  const visible = await getRecipe(recipeId, session.user.id);
  if (!visible) return { ok: false, error: "No such recipe" };

  await rate(recipeId, session.user.id, rating);

  revalidatePath("/recipes");
  revalidatePath("/discover");
  revalidatePath(`/recipes/${recipeId}`);
  return { ok: true };
}

export interface UndoResult {
  ok: boolean;
  error?: string;
}

/**
 * Takes a cook back: it did not happen.
 *
 * It used to put the ingredients back on the shelf as well, through the same
 * container rule cooking took them off by. With no stock (v2) there is
 * nothing to put back, and what is left is the record - marked undone rather
 * than deleted, so the log, the planner and times_cooked all stop counting it.
 *
 * The claim is conditional on undone_at still being null, so a double tap
 * cannot take times_cooked down twice.
 */
export async function undoCook(eventId: number): Promise<UndoResult> {
  if (!Number.isInteger(eventId) || eventId <= 0) {
    return { ok: false, error: "Invalid cook" };
  }

  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  const tx = await getDb().transaction("write");

  try {
    const eventResult = await tx.execute({
      sql: "SELECT * FROM cook_events WHERE id = ? AND kitchen_id = ?",
      args: [eventId, access.kitchen.id],
    });
    const event = eventResult.rows[0] as unknown as CookEvent | undefined;

    if (!event) {
      await tx.rollback();
      return { ok: false, error: "That cook is no longer on record" };
    }

    const claimed = await tx.execute({
      sql: `UPDATE cook_events SET undone_at = CURRENT_TIMESTAMP
            WHERE id = ? AND kitchen_id = ? AND undone_at IS NULL`,
      args: [eventId, access.kitchen.id],
    });

    if (claimed.rowsAffected === 0) {
      await tx.rollback();
      return { ok: false, error: "Already undone" };
    }

    await tx.execute({
      sql: "UPDATE recipes SET times_cooked = MAX(0, times_cooked - 1) WHERE id = ?",
      args: [event.recipe_id],
    });

    await tx.commit();

    /**
     * The news goes with the cook.
     *
     * Undo marks undone_at rather than deleting the row, so the cascade on
     * notifications never fires and the author is left holding "@luna cooked
     * your ragu" for a dinner that was taken back. Outside the transaction
     * because it is a different kind of failure: a notification that outlives
     * its cook is untidy, a rolled-back undo leaves the log wrong.
     *
     * The push, if one went, cannot be recalled - that is inherent to push and
     * the reason this app sends one only for something that already happened.
     */
    await forgetCook(eventId).catch(() => {});

    revalidatePath("/recipes");
    revalidatePath(`/recipes/${event.recipe_id}`);
    revalidatePath("/cooked");

    return { ok: true };
  } catch (error) {
    await tx.rollback();
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Undo failed",
    };
  }
}
