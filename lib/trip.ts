import { getDb, plainRows } from "./db";
import { getLinks, resolveWithLinks } from "./cookbook";
import { indexStock } from "./pantry-match";
import { totalOnHand } from "./containers";
import { resolveAmount, scaleQuantity } from "./units";
import { getItems } from "./queries";
import type { Dimension, RecipeIngredient } from "./types";

/**
 * The trip: one recipe, pinned, from deciding on it to eating it.
 *
 * Phase 5's spine. Tonight, the walk to the shop, the checkout, the walk home
 * and the stove are one continuous thing, and the app used to make you
 * navigate between five screens as if they were unrelated errands.
 *
 * There is no status column and no state machine. Where you are in a trip is
 * derivable from facts that already exist - what is short, what is on the
 * list, what has been ticked - and a stored status would be a second opinion
 * about those facts, free to drift out of step with them. The row says only
 * "this kitchen is shopping for this recipe".
 */

export interface Trip {
  recipe_id: number;
  name: string;
  photo_url: string | null;
  base_servings: number;
  pinned_at: string;
  /** Lines the shelves cannot supply, as the recipe words them. */
  short: string[];
  /** Of those, the ones already ticked off in the basket. */
  inBasket: number;
  /** Of those, the ones still waiting on the list. */
  toBuy: number;
  /**
   * Nothing missing: the cooking can start.
   *
   * True either because the shelves were never short or because the shopping
   * has been done and put away - both of which are the same sentence from the
   * stove's point of view.
   */
  ready: boolean;
}

/** Pins a recipe as the trip, replacing whatever was pinned before. */
export async function pin(
  kitchenId: number,
  recipeId: number,
  userId: number,
): Promise<void> {
  await getDb().execute({
    // One row per kitchen, so pinning a second recipe is a replacement rather
    // than a queue. A shopping trip you are on two of is not a thing.
    sql: `INSERT INTO pinned_recipes (kitchen_id, recipe_id, pinned_by, pinned_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(kitchen_id) DO UPDATE
            SET recipe_id = excluded.recipe_id,
                pinned_by = excluded.pinned_by,
                pinned_at = CURRENT_TIMESTAMP`,
    args: [kitchenId, recipeId, userId],
  });
}

export async function unpin(kitchenId: number): Promise<void> {
  await getDb().execute({
    sql: "DELETE FROM pinned_recipes WHERE kitchen_id = ?",
    args: [kitchenId],
  });
}

/**
 * Drops the pin if it is on this recipe.
 *
 * Cooking the thing is the end of the trip, and a pin that outlives the meal
 * would have the app still shopping for last night's dinner. Undoing a cook
 * does not re-pin: by then you have eaten, or decided you had not, and either
 * way the shopping is not the question.
 */
export async function unpinIf(kitchenId: number, recipeId: number): Promise<void> {
  await getDb().execute({
    sql: "DELETE FROM pinned_recipes WHERE kitchen_id = ? AND recipe_id = ?",
    args: [kitchenId, recipeId],
  });
}

interface PinRow {
  recipe_id: number;
  name: string;
  photo_url: string | null;
  base_servings: number;
  pinned_at: string;
}

/**
 * What the kitchen is shopping for, and how far through it is.
 *
 * Every count here is worked out from the shelves and the list at the moment
 * it is asked, which is why the answer is right after a receipt scan, after
 * somebody else ticks something off in the shop, and after a jar turns up at
 * the back of a cupboard.
 */
export async function getTrip(kitchenId: number | null): Promise<Trip | null> {
  if (kitchenId === null) return null;

  const pinned = await getDb().execute({
    sql: `SELECT p.recipe_id, p.pinned_at, r.name, r.photo_url, r.base_servings
          FROM pinned_recipes p
          JOIN recipes r ON r.id = p.recipe_id
          WHERE p.kitchen_id = ?`,
    args: [kitchenId],
  });
  const row = plainRows<PinRow>(pinned)[0];
  if (!row) return null;

  const [lines, items, links, list] = await Promise.all([
    getDb().execute({
      sql: "SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY position, id",
      args: [row.recipe_id],
    }),
    getItems(kitchenId),
    getLinks(kitchenId, row.recipe_id),
    getDb().execute({
      sql: `SELECT item_name, bought_at FROM shopping_list WHERE kitchen_id = ?`,
      args: [kitchenId],
    }),
  ]);

  const ingredients = plainRows<RecipeIngredient>(lines);
  const index = indexStock(items);
  const byId = new Map(items.map((item) => [item.id, item]));

  const bought = new Map(
    plainRows<{ item_name: string; bought_at: string | null }>(list).map((line) => [
      line.item_name.toLowerCase(),
      Boolean(line.bought_at),
    ]),
  );

  const short: string[] = [];
  let inBasket = 0;

  for (const line of ingredients) {
    if (line.optional === 1) continue;

    const { item } = resolveWithLinks(line, links, index, byId);
    const wanted = scaleQuantity(line.quantity, row.base_servings, row.base_servings);

    /**
     * Short means the shelf cannot supply it, judged the same way the cook
     * panel judges it - against everything on hand rather than the open
     * container, and taking an unspecified amount at its word.
     */
    if (item) {
      const onHand = totalOnHand(item);
      if (onHand === null) continue;

      const needed = resolveAmount(
        wanted,
        line.unit,
        { size: line.pack_size, unit: line.pack_unit },
        item.dimension as Dimension,
      );
      if (!needed.ok || needed.quantity <= onHand) continue;
    }

    short.push(line.item_name);

    // On the list and ticked: bought, not yet put away. Still short on the
    // shelf, but not something to go looking for in the shop.
    const name = (item?.name ?? line.item_name).toLowerCase();
    if (bought.get(name) || bought.get(line.item_name.toLowerCase())) inBasket += 1;
  }

  return {
    recipe_id: row.recipe_id,
    name: row.name,
    photo_url: row.photo_url,
    base_servings: row.base_servings,
    pinned_at: row.pinned_at,
    short,
    inBasket,
    toBuy: short.length - inBasket,
    ready: short.length === 0,
  };
}
