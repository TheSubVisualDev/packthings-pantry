import { getDb } from "./db";
import { getItems } from "./queries";
import {
  indexStock,
  isConfident,
  resolveLine,
  type Confidence,
  type Resolution,
  type StockIndex,
} from "./pantry-match";
import { inStock } from "./containers";
import type { Item, RecipeIngredient } from "./types";

/**
 * The cookbook: recipes a kitchen has adopted, and what their ingredients mean
 * on these particular shelves.
 *
 * Adding is the moment the app is allowed to ask. Everywhere else - the stock
 * page, the recipe card, the stove - it has to already know, because a
 * question asked mid-cook is a question asked at the worst possible time. So
 * lib/pantry-match.ts runs once here, the confident lines link silently, and
 * whatever is left over is the one prompt anybody sees.
 *
 * The links are per kitchen because that is what they are about.
 * recipe_ingredients.item_id tried to hold the same fact on the recipe and
 * could not: share a recipe and the link points at someone else's cupboard.
 */

/** One ingredient line, with what this kitchen thinks it means. */
export interface ProposedLink {
  ingredient: RecipeIngredient;
  /** The row it would link to, or null for "not in my kitchen". */
  item: Item | null;
  confidence: Confidence;
  /** Other rows worth offering, best first. What the picker lists. */
  alternatives: Item[];
  /** True when this one needs a human before the recipe can be adopted. */
  asks: boolean;
}

/** A decision about one line: the ingredient, and the row it means (or none). */
export interface LinkChoice {
  ingredient_id: number;
  item_id: number | null;
}

/**
 * What adding this recipe to the cookbook would link, and what it would ask.
 *
 * Read-only - nothing is written until someone accepts. Called to build the
 * add dialog, and again on submit so the decision is recomputed from stock as
 * it is now rather than trusted from a form that may have been open a while.
 */
export async function proposeLinks(
  kitchenId: number,
  recipeId: number,
): Promise<ProposedLink[]> {
  const [items, ingredientResult] = await Promise.all([
    getItems(kitchenId),
    getDb().execute({
      sql: "SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY position, id",
      args: [recipeId],
    }),
  ]);

  const stock = indexStock(items);
  const lines = ingredientResult.rows as unknown as RecipeIngredient[];

  return lines.map((ingredient) => {
    const resolution = resolveLine(ingredient.item_name, stock, ingredient.unit);
    return {
      ingredient,
      item: isConfident(resolution) ? resolution.item : null,
      confidence: resolution.confidence,
      alternatives: alternativesFor(resolution),
      /**
       * `none` does not ask. An ingredient this kitchen has never held is the
       * normal state of a recipe you have not shopped for yet, and making
       * someone dismiss a question about saffron before they can save a recipe
       * is the friction this whole phase exists to remove. Only a genuine
       * near-miss is worth a person's attention.
       */
      asks: resolution.confidence === "maybe",
    };
  });
}

/**
 * The rows to offer in the picker.
 *
 * The resolver's runners-up first, since they are why the line is a `maybe` at
 * all, then nothing else - a picker listing the whole pantry is a search box
 * wearing a disguise, and the add screen already has one of those.
 */
function alternativesFor(resolution: Resolution): Item[] {
  const offered = resolution.item && !isConfident(resolution) ? [resolution.item] : [];
  return [...offered, ...resolution.alternatives].slice(0, 5);
}

/**
 * Adopts a recipe, writing the links that were agreed.
 *
 * `choices` overrides the proposal line by line; anything not mentioned takes
 * whatever proposeLinks worked out, so a caller that has nothing to say can
 * pass none. Re-adding a recipe that is already here refreshes the links it
 * was given rather than failing, because "add" and "fix the links" are the
 * same act from the outside.
 *
 * One transaction: a half-linked recipe would cook wrongly and silently, which
 * is the failure mode this whole table exists to prevent.
 */
export async function addToCookbook(
  kitchenId: number,
  recipeId: number,
  userId: number,
  choices: LinkChoice[] = [],
): Promise<{ ok: boolean; linked: number; asked: number }> {
  const proposed = await proposeLinks(kitchenId, recipeId);
  const decided = new Map(choices.map((choice) => [choice.ingredient_id, choice.item_id]));

  const tx = await getDb().transaction("write");
  try {
    await tx.execute({
      sql: `INSERT INTO cookbook (kitchen_id, recipe_id, added_by)
            VALUES (?, ?, ?)
            ON CONFLICT (kitchen_id, recipe_id) DO NOTHING`,
      args: [kitchenId, recipeId, userId],
    });

    let linked = 0;
    for (const line of proposed) {
      const itemId = decided.has(line.ingredient.id)
        ? decided.get(line.ingredient.id)!
        : (line.item?.id ?? null);

      /**
       * A row is written even when the answer is "nothing", because a null
       * item_id means asked-and-there-is-none, and no row at all means never
       * asked. Cooking treats those differently: the first is settled, the
       * second is a line added by an edit since, which gets resolved afresh.
       */
      await tx.execute({
        sql: `INSERT INTO cookbook_links (kitchen_id, ingredient_id, item_id)
              VALUES (?, ?, ?)
              ON CONFLICT (kitchen_id, ingredient_id) DO UPDATE SET item_id = excluded.item_id`,
        args: [kitchenId, line.ingredient.id, itemId],
      });
      if (itemId !== null) linked += 1;
    }

    await tx.commit();
    return { ok: true, linked, asked: proposed.filter((line) => line.asks).length };
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

/**
 * Takes a recipe out of the cookbook, keeping every link it was given.
 *
 * Removing something is saying you do not cook it, not saying you were wrong
 * about which jar it meant. Keeping the links means putting it back later is
 * one tap rather than the whole linking conversation again - and they cost a
 * few rows, which is nothing against asking somebody the same questions twice.
 */
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

/**
 * The agreed links for a kitchen, by ingredient line.
 *
 * A missing key is "never asked"; a key holding null is "asked, and there is
 * none". Callers must keep those apart - see resolveWithLinks.
 */
export async function getLinks(
  kitchenId: number | null,
  recipeId?: number,
): Promise<Map<number, number | null>> {
  const links = new Map<number, number | null>();
  if (kitchenId === null) return links;

  const result = await getDb().execute(
    recipeId === undefined
      ? {
          sql: "SELECT ingredient_id, item_id FROM cookbook_links WHERE kitchen_id = ?",
          args: [kitchenId],
        }
      : {
          sql: `SELECT cl.ingredient_id, cl.item_id
                FROM cookbook_links cl
                JOIN recipe_ingredients ri ON ri.id = cl.ingredient_id
                WHERE cl.kitchen_id = ? AND ri.recipe_id = ?`,
          args: [kitchenId, recipeId],
        },
  );

  for (const row of result.rows as unknown as {
    ingredient_id: number;
    item_id: number | null;
  }[]) {
    links.set(row.ingredient_id, row.item_id);
  }
  return links;
}

/** Changes one line's link after the fact, from the recipe page. */
export async function relink(
  kitchenId: number,
  ingredientId: number,
  itemId: number | null,
): Promise<void> {
  await getDb().execute({
    sql: `INSERT INTO cookbook_links (kitchen_id, ingredient_id, item_id)
          VALUES (?, ?, ?)
          ON CONFLICT (kitchen_id, ingredient_id) DO UPDATE SET item_id = excluded.item_id`,
    args: [kitchenId, ingredientId, itemId],
  });
}

/**
 * What an ingredient line means, preferring the decision already taken.
 *
 * The agreed link wins outright, including when it says "nothing" - a person
 * said so, and re-guessing over the top of an answer is how an app stops being
 * trusted. Only a line nobody has been asked about falls through to the
 * resolver, which happens when a recipe gains an ingredient after it was
 * adopted.
 *
 * This is the single rule cooking, readiness counts and the shortfall list all
 * read, so there is no way for them to disagree about which jar is meant.
 */
export function resolveWithLinks(
  ingredient: Pick<RecipeIngredient, "id" | "item_name" | "unit">,
  links: Map<number, number | null>,
  stock: StockIndex,
  byId: Map<number, Item>,
): { item: Item | null; agreed: boolean } {
  if (links.has(ingredient.id)) {
    // `?? null` only narrows the type: has() already ruled out undefined.
    const itemId = links.get(ingredient.id) ?? null;
    return { item: itemId === null ? null : (byId.get(itemId) ?? null), agreed: true };
  }

  const resolution = resolveLine(ingredient.item_name, stock, ingredient.unit);
  return { item: isConfident(resolution) ? resolution.item : null, agreed: false };
}

/** How much of a recipe this kitchen can supply right now. */
export function countStockedLines(
  ingredients: Pick<RecipeIngredient, "id" | "item_name" | "unit">[],
  links: Map<number, number | null>,
  stock: StockIndex,
  byId: Map<number, Item>,
): { have: number; total: number } {
  let have = 0;
  for (const ingredient of ingredients) {
    const { item } = resolveWithLinks(ingredient, links, stock, byId);
    if (item && inStock(item)) have += 1;
  }
  return { have, total: ingredients.length };
}
