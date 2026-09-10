import { getDb } from "./db";
import type { ParsedRecipe } from "./recipe-schema";

/**
 * Writing a parsed recipe to the database.
 *
 * Shared by the paste box, the editor and the Claude endpoint, so all three
 * produce identical rows. Everything happens in one transaction: a recipe with
 * its ingredients but not its steps is worse than no recipe at all, and Claude
 * Code writes to this database too.
 */

/**
 * Creates a recipe, or replaces the contents of an existing one.
 *
 * Ingredients and steps are deleted and rewritten rather than diffed. They are
 * ordered lists that the editor reorders freely, so a diff would spend its
 * effort reconstructing positions that a rewrite gets right for nothing. The
 * cost is that ingredient ids change on every save, which nothing outside the
 * recipe depends on - cook_events records item ids, not ingredient ids.
 */
export async function saveRecipe(
  parsed: ParsedRecipe,
  existingId?: number,
): Promise<number> {
  const tx = await getDb().transaction("write");

  try {
    let recipeId: number;

    if (existingId) {
      // times_cooked and rating are the household's history with the dish and
      // survive an edit; they aren't part of the document being saved.
      await tx.execute({
        sql: `UPDATE recipes SET name = ?, description = ?, base_servings = ?,
                prep_minutes = ?, cook_minutes = ?, source = ?, notes = ?,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`,
        args: [
          parsed.name,
          parsed.description,
          parsed.base_servings,
          parsed.prep_minutes,
          parsed.cook_minutes,
          parsed.source,
          parsed.notes,
          existingId,
        ],
      });
      recipeId = existingId;

      await tx.execute({
        sql: "DELETE FROM recipe_ingredients WHERE recipe_id = ?",
        args: [recipeId],
      });
      // recipe_step_ingredients cascades from the steps.
      await tx.execute({
        sql: "DELETE FROM recipe_steps WHERE recipe_id = ?",
        args: [recipeId],
      });
    } else {
      const inserted = await tx.execute({
        sql: `INSERT INTO recipes (name, description, base_servings, prep_minutes,
                cook_minutes, source, notes, times_cooked, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP) RETURNING id`,
        args: [
          parsed.name,
          parsed.description,
          parsed.base_servings,
          parsed.prep_minutes,
          parsed.cook_minutes,
          parsed.source,
          parsed.notes,
        ],
      });
      recipeId = (inserted.rows[0] as unknown as { id: number }).id;
    }

    const ingredientIds: number[] = [];
    for (const line of parsed.ingredients) {
      const row = await tx.execute({
        sql: `INSERT INTO recipe_ingredients
                (recipe_id, item_id, item_name, quantity, unit, note, optional, section, position)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        args: [
          recipeId,
          line.item_id,
          line.item_name,
          line.quantity,
          line.unit,
          line.note,
          line.optional ? 1 : 0,
          line.section,
          line.position,
        ],
      });
      ingredientIds.push((row.rows[0] as unknown as { id: number }).id);
    }

    for (const step of parsed.steps) {
      const row = await tx.execute({
        sql: `INSERT INTO recipe_steps (recipe_id, position, section, body, minutes)
              VALUES (?, ?, ?, ?, ?) RETURNING id`,
        args: [recipeId, step.position, step.section, step.body, step.minutes],
      });
      const stepId = (row.rows[0] as unknown as { id: number }).id;

      for (const index of step.uses) {
        const ingredientId = ingredientIds[index];
        if (ingredientId === undefined) continue;

        await tx.execute({
          sql: `INSERT INTO recipe_step_ingredients (step_id, ingredient_id)
                VALUES (?, ?)`,
          args: [stepId, ingredientId],
        });
      }
    }

    await tx.commit();
    return recipeId;
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

export async function deleteRecipe(id: number): Promise<boolean> {
  // Ingredients and steps cascade; cook_events cascades too, which is the
  // right call - a history entry pointing at a recipe that no longer exists
  // can't be undone or read.
  const result = await getDb().execute({
    sql: "DELETE FROM recipes WHERE id = ?",
    args: [id],
  });
  return result.rowsAffected > 0;
}
