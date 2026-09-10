"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { scaleQuantity, toCanonical } from "@/lib/units";
import type { Dimension, Item, Recipe, RecipeIngredient } from "@/lib/types";

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

    const itemResult = await tx.execute("SELECT * FROM items");
    const itemsByName = new Map(
      (itemResult.rows as unknown as Item[]).map((item) => [
        item.name.toLowerCase(),
        item,
      ]),
    );

    const applied: CookLineResult[] = [];
    const flagged: CookLineResult[] = [];

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

    await tx.commit();

    revalidatePath("/pantry");
    revalidatePath("/recipes");
    revalidatePath(`/recipes/${recipeId}`);

    return { ok: true, applied, flagged };
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
