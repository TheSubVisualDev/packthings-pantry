"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireKitchenRole } from "@/lib/session";
import { scaleQuantity, toCanonical } from "@/lib/units";
import type {
  CookChange,
  CookEvent,
  Dimension,
  Item,
  Recipe,
  RecipeIngredient,
} from "@/lib/types";

export interface CookLineResult {
  item_name: string;
  /** Amount taken out of stock, in the item's canonical unit. */
  decremented?: number;
  unit?: string;
  remaining?: number;
  /** Set when the line couldn't be applied cleanly. */
  issue?: "not-in-pantry" | "dimension-mismatch" | "unknown-unit" | "short";
  detail?: string;
}

export interface CookResult {
  ok: boolean;
  error?: string;
  applied: CookLineResult[];
  flagged: CookLineResult[];
  /** Row in cook_events, and the handle undo needs. Absent if nothing moved. */
  eventId?: number;
}

/**
 * Marks a recipe cooked at the chosen serving count and decrements stock.
 *
 * The whole read-scale-write runs inside one transaction: a stock edit from
 * Claude Code (the other writer on this database) must not interleave and
 * double-apply or lose a decrement. Quantities are recomputed from the
 * database rather than trusted from the client.
 *
 * Lines that can't be matched - ingredient absent, or a unit in a different
 * dimension than the item's canonical unit - are flagged for manual handling
 * rather than silently skipped. Stored recipe quantities always stay at base
 * servings; the scaling applies to the decrement only.
 */
export async function cookRecipe(
  recipeId: number,
  servings: number,
): Promise<CookResult> {
  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    return { ok: false, error: "Invalid recipe", applied: [], flagged: [] };
  }
  if (!Number.isFinite(servings) || servings <= 0 || servings > 100) {
    return { ok: false, error: "Invalid serving count", applied: [], flagged: [] };
  }

  // Cooking spends stock, so it needs a kitchen you're allowed to change.
  const access = await requireKitchenRole("editor");
  if (!access.ok) {
    return { ok: false, error: access.error, applied: [], flagged: [] };
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
      return { ok: false, error: "Recipe not found", applied: [], flagged: [] };
    }

    const ingredientResult = await tx.execute({
      sql: "SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY id",
      args: [recipeId],
    });
    const lines = ingredientResult.rows as unknown as RecipeIngredient[];

    const itemResult = await tx.execute({
      sql: "SELECT * FROM items WHERE kitchen_id = ?",
      args: [access.kitchen.id],
    });
    const itemsByName = new Map(
      (itemResult.rows as unknown as Item[]).map((item) => [
        item.name.toLowerCase(),
        item,
      ]),
    );

    const applied: CookLineResult[] = [];
    const flagged: CookLineResult[] = [];
    const changes: CookChange[] = [];

    for (const line of lines) {
      const item = itemsByName.get(line.item_name.toLowerCase());
      if (!item) {
        flagged.push({ item_name: line.item_name, issue: "not-in-pantry" });
        continue;
      }

      const scaled = scaleQuantity(
        line.quantity,
        recipe.base_servings,
        servings,
      );
      const converted = toCanonical(
        scaled,
        line.unit,
        item.dimension as Dimension,
      );

      if (!converted.ok) {
        flagged.push({
          item_name: line.item_name,
          issue:
            converted.reason === "dimension-mismatch"
              ? "dimension-mismatch"
              : "unknown-unit",
          detail:
            converted.reason === "dimension-mismatch"
              ? `${line.unit} can't convert to ${item.canonical_unit}`
              : `unknown unit "${line.unit}"`,
        });
        continue;
      }

      // Stock never goes negative - take what's there and flag the shortfall.
      const take = Math.min(converted.quantity, item.quantity);
      const remaining = item.quantity - take;

      await tx.execute({
        sql: "UPDATE items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        args: [remaining, item.id],
      });

      // Zero-take lines have nothing to give back, so they stay out of the log.
      if (take > 0) {
        changes.push({ item_id: item.id, delta: take, unit: item.canonical_unit });
      }

      const result: CookLineResult = {
        item_name: line.item_name,
        decremented: take,
        unit: item.canonical_unit,
        remaining,
      };

      if (take < converted.quantity) {
        flagged.push({
          ...result,
          issue: "short",
          detail: `needed ${converted.quantity}${item.canonical_unit}, only ${item.quantity}${item.canonical_unit} in stock`,
        });
      } else {
        applied.push(result);
      }
    }

    await tx.execute({
      sql: "UPDATE recipes SET times_cooked = times_cooked + 1 WHERE id = ?",
      args: [recipeId],
    });

    // Written inside the same transaction as the decrements: a log that can be
    // committed separately from the change it describes is worse than none.
    const event = await tx.execute({
      sql: `INSERT INTO cook_events (kitchen_id, cooked_by, recipe_id, servings, changes)
            VALUES (?, ?, ?, ?, ?)`,
      args: [
        access.kitchen.id,
        access.user.id,
        recipeId,
        servings,
        JSON.stringify(changes),
      ],
    });

    await tx.commit();

    revalidatePath("/pantry");
    revalidatePath("/recipes");
    revalidatePath(`/recipes/${recipeId}`);

    return {
      ok: true,
      applied,
      flagged,
      eventId: event.lastInsertRowid ? Number(event.lastInsertRowid) : undefined,
    };
  } catch (error) {
    await tx.rollback();
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Cook failed",
      applied: [],
      flagged: [],
    };
  }
}

/** Sets the shared household rating. One rating per recipe, no users table. */
export async function rateRecipe(
  recipeId: number,
  rating: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: "Rating must be 1-5" };
  }

  await getDb().execute({
    sql: "UPDATE recipes SET rating = ? WHERE id = ?",
    args: [rating, recipeId],
  });

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${recipeId}`);
  return { ok: true };
}

export interface UndoLineResult {
  item_name: string;
  /** Amount put back, in the item's canonical unit. */
  restored: number;
  unit: string;
  quantity: number;
}

export interface UndoResult {
  ok: boolean;
  error?: string;
  restored: UndoLineResult[];
}

/**
 * Reverses a cook by adding its recorded deltas back to stock.
 *
 * Deltas rather than remembered absolutes: Claude Code writes to this database
 * too, so stock may have moved since the cook. Adding back what was taken
 * preserves an edit made in between, where restoring a snapshot would discard
 * it. A cook that was clamped short recorded what actually left stock, so this
 * gives back exactly that and no more.
 *
 * The guard update runs before the quantity changes and is conditional on
 * undone_at still being null, so a double-tap can't apply the deltas twice.
 */
export async function undoCook(eventId: number): Promise<UndoResult> {
  if (!Number.isInteger(eventId) || eventId <= 0) {
    return { ok: false, error: "Invalid cook", restored: [] };
  }

  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error, restored: [] };

  const tx = await getDb().transaction("write");

  try {
    const eventResult = await tx.execute({
      sql: "SELECT * FROM cook_events WHERE id = ? AND kitchen_id = ?",
      args: [eventId, access.kitchen.id],
    });
    const event = eventResult.rows[0] as unknown as CookEvent | undefined;

    if (!event) {
      await tx.rollback();
      return { ok: false, error: "That cook is no longer on record", restored: [] };
    }

    const claimed = await tx.execute({
      sql: `UPDATE cook_events SET undone_at = CURRENT_TIMESTAMP
            WHERE id = ? AND kitchen_id = ? AND undone_at IS NULL`,
      args: [eventId, access.kitchen.id],
    });

    if (claimed.rowsAffected === 0) {
      await tx.rollback();
      return { ok: false, error: "Already undone", restored: [] };
    }

    const changes = JSON.parse(event.changes) as CookChange[];
    const restored: UndoLineResult[] = [];

    for (const change of changes) {
      // MAX(0, ...) is belt and braces - deltas are always positive going back
      // in - but it keeps a hand-edited log from writing a negative quantity.
      const updated = await tx.execute({
        sql: `UPDATE items SET quantity = MAX(0, quantity + ?), updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND kitchen_id = ? RETURNING name, quantity, canonical_unit`,
        args: [change.delta, change.item_id, access.kitchen.id],
      });

      const row = updated.rows[0] as unknown as
        | { name: string; quantity: number; canonical_unit: string }
        | undefined;

      // The item may have been deleted since the cook. Nothing to restore it
      // to, and re-creating it would guess at fields the log doesn't hold.
      if (!row) continue;

      restored.push({
        item_name: row.name,
        restored: change.delta,
        unit: row.canonical_unit,
        quantity: row.quantity,
      });
    }

    await tx.execute({
      sql: "UPDATE recipes SET times_cooked = MAX(0, times_cooked - 1) WHERE id = ?",
      args: [event.recipe_id],
    });

    await tx.commit();

    revalidatePath("/pantry");
    revalidatePath("/recipes");
    revalidatePath(`/recipes/${event.recipe_id}`);

    return { ok: true, restored };
  } catch (error) {
    await tx.rollback();
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Undo failed",
      restored: [],
    };
  }
}
