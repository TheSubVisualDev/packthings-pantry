import { getDb } from "./db";

/**
 * The cookbook: the recipes a kitchen has adopted.
 *
 * It used to be half of something bigger. Adopting a recipe was where the app
 * asked which jar each ingredient meant, and wrote the answers to
 * `cookbook_links` so cooking knew what to take off the shelf. v2 stopped
 * tracking stock (18 Oct 2026, docs/ROADMAP-V2.md), so there is no shelf to
 * link to and nothing to ask: adopting is now just saying "this is a thing my
 * kitchen cooks". The links table is left in the schema, unwritten and unread.
 */

/**
 * Adopts a recipe. Adding one that is already here is not an error - "add" is
 * idempotent from the outside, and a double tap should not say it failed.
 */
export async function addToCookbook(
  kitchenId: number,
  recipeId: number,
  userId: number,
): Promise<void> {
  await getDb().execute({
    sql: `INSERT INTO cookbook (kitchen_id, recipe_id, added_by)
          VALUES (?, ?, ?)
          ON CONFLICT (kitchen_id, recipe_id) DO NOTHING`,
    args: [kitchenId, recipeId, userId],
  });
}

export async function removeFromCookbook(
  kitchenId: number,
  recipeId: number,
): Promise<boolean> {
  const result = await getDb().execute({
    sql: "DELETE FROM cookbook WHERE kitchen_id = ? AND recipe_id = ?",
    args: [kitchenId, recipeId],
  });
  return result.rowsAffected > 0;
}

export async function isInCookbook(
  kitchenId: number | null,
  recipeId: number,
): Promise<boolean> {
  if (kitchenId === null) return false;
  const result = await getDb().execute({
    sql: "SELECT 1 FROM cookbook WHERE kitchen_id = ? AND recipe_id = ?",
    args: [kitchenId, recipeId],
  });
  return result.rows.length > 0;
}

/** Every recipe id this kitchen has adopted. */
export async function getCookbookIds(kitchenId: number | null): Promise<Set<number>> {
  if (kitchenId === null) return new Set();
  const result = await getDb().execute({
    sql: "SELECT recipe_id FROM cookbook WHERE kitchen_id = ?",
    args: [kitchenId],
  });
  return new Set((result.rows as unknown as { recipe_id: number }[]).map((r) => r.recipe_id));
}
