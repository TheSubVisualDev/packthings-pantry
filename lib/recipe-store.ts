import { getDb } from "./db";
import type { ParsedRecipe } from "./recipe-schema";
import type { Visibility } from "./social";

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
  authorId?: number,
): Promise<number> {
  const tx = await getDb().transaction("write");

  /** Step photos, by position, carried over a delete-and-rewrite. */
  const keptPhotos = new Map<number, string>();

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

      // Steps are about to be deleted and rewritten, which would take their
      // photos with them. Photos aren't part of the document being saved -
      // they're uploaded separately and belong to the step - so they're carried
      // across by position, the one thing that survives the ids changing.
      const existingPhotos = await tx.execute({
        sql: `SELECT position, photo_url FROM recipe_steps
              WHERE recipe_id = ? AND photo_url IS NOT NULL`,
        args: [recipeId],
      });
      for (const row of existingPhotos.rows as unknown as {
        position: number;
        photo_url: string;
      }[]) {
        keptPhotos.set(row.position, row.photo_url);
      }

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
        sql: `INSERT INTO recipes (author_id, visibility, name, description, base_servings,
                prep_minutes, cook_minutes, source, notes, times_cooked, updated_at)
              VALUES (?, 'private', ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP) RETURNING id`,
        args: [
          // New recipes start private. Publishing is a decision, not a default.
          authorId ?? null,
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
                (recipe_id, item_id, item_name, quantity, unit, pack_size, pack_unit,
                 note, optional, section, position)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        args: [
          recipeId,
          line.item_id,
          line.item_name,
          line.quantity,
          line.unit,
          line.pack_size,
          line.pack_unit,
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
        sql: `INSERT INTO recipe_steps (recipe_id, position, section, body, minutes, photo_url)
              VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
        args: [
          recipeId,
          step.position,
          step.section,
          step.body,
          step.minutes,
          keptPhotos.get(step.position) ?? null,
        ],
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

/**
 * Copies a recipe into someone else's collection.
 *
 * Everything is duplicated rather than shared, because the copy is now theirs
 * to change - halve the chilli, swap the tofu - without editing the original.
 * forked_from_id keeps the trail back, so "adapted from @someone" survives
 * however much the copy drifts.
 *
 * The new copy is private and uncooked: the history belongs to whoever cooked
 * it, not to whoever pressed save.
 */
export async function forkRecipe(
  recipeId: number,
  newAuthorId: number,
): Promise<number | null> {
  const tx = await getDb().transaction("write");

  try {
    const source = await tx.execute({
      sql: "SELECT * FROM recipes WHERE id = ?",
      args: [recipeId],
    });
    const recipe = source.rows[0] as unknown as
      | {
          name: string;
          description: string | null;
          base_servings: number;
          prep_minutes: number | null;
          cook_minutes: number | null;
          source: string | null;
          notes: string | null;
        }
      | undefined;

    if (!recipe) {
      await tx.rollback();
      return null;
    }

    const created = await tx.execute({
      sql: `INSERT INTO recipes (author_id, visibility, forked_from_id, name, description,
              base_servings, prep_minutes, cook_minutes, source, notes, times_cooked, updated_at)
            VALUES (?, 'private', ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP) RETURNING id`,
      args: [
        newAuthorId,
        recipeId,
        recipe.name,
        recipe.description,
        recipe.base_servings,
        recipe.prep_minutes,
        recipe.cook_minutes,
        recipe.source,
        recipe.notes,
      ],
    });
    const newId = (created.rows[0] as unknown as { id: number }).id;

    // item_id is deliberately not copied. It points at stock in the original
    // author's kitchen, which means nothing in anyone else's - the name is the
    // portable half, and the cook flow resolves it against your own shelves.
    await tx.execute({
      sql: `INSERT INTO recipe_ingredients
              (recipe_id, item_name, quantity, unit, pack_size, pack_unit,
               note, optional, section, position)
            SELECT ?, item_name, quantity, unit, pack_size, pack_unit,
                   note, optional, section, position
            FROM recipe_ingredients WHERE recipe_id = ?`,
      args: [newId, recipeId],
    });

    const steps = await tx.execute({
      sql: "SELECT * FROM recipe_steps WHERE recipe_id = ? ORDER BY position, id",
      args: [recipeId],
    });

    for (const row of steps.rows as unknown as {
      id: number;
      position: number;
      section: string | null;
      body: string;
      minutes: number | null;
      photo_url: string | null;
    }[]) {
      const copied = await tx.execute({
        sql: `INSERT INTO recipe_steps (recipe_id, position, section, body, minutes, photo_url)
              VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
        // The photo URL is shared rather than re-uploaded: both copies point at
        // the same blob, and deleting one recipe's photo only clears its own row.
        args: [newId, row.position, row.section, row.body, row.minutes, row.photo_url],
      });
      const newStepId = (copied.rows[0] as unknown as { id: number }).id;

      // Re-point the step's ingredient links at the copied lines, matched by
      // position - the one thing that survives the ids changing.
      await tx.execute({
        sql: `INSERT INTO recipe_step_ingredients (step_id, ingredient_id)
              SELECT ?, mine.id
              FROM recipe_step_ingredients si
              JOIN recipe_ingredients theirs ON theirs.id = si.ingredient_id
              JOIN recipe_ingredients mine
                ON mine.recipe_id = ? AND mine.position = theirs.position
              WHERE si.step_id = ?`,
        args: [newStepId, newId, row.id],
      });
    }

    await tx.commit();
    return newId;
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

/** One rating per person. Re-rating replaces your own, nobody else's. */
export async function rate(
  recipeId: number,
  userId: number,
  rating: number,
): Promise<void> {
  await getDb().execute({
    sql: `INSERT INTO recipe_ratings (recipe_id, user_id, rating, rated_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(recipe_id, user_id) DO UPDATE SET
            rating = excluded.rating, rated_at = CURRENT_TIMESTAMP`,
    args: [recipeId, userId, rating],
  });
}

export async function myRating(
  recipeId: number,
  userId: number,
): Promise<number | null> {
  const result = await getDb().execute({
    sql: "SELECT rating FROM recipe_ratings WHERE recipe_id = ? AND user_id = ?",
    args: [recipeId, userId],
  });
  return (result.rows[0] as unknown as { rating: number })?.rating ?? null;
}

export async function setVisibility(
  recipeId: number,
  authorId: number,
  visibility: Visibility,
): Promise<boolean> {
  // The author is in the WHERE clause, so this can only ever change your own.
  const result = await getDb().execute({
    sql: "UPDATE recipes SET visibility = ? WHERE id = ? AND author_id = ?",
    args: [visibility, recipeId, authorId],
  });
  return result.rowsAffected > 0;
}
