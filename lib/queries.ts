import { getDb } from "./db";
import { VISIBLE_TO_VIEWER, viewerArgs } from "./social";
import type {
  Item,
  Recipe,
  RecipeWithAuthor,
  RecipeIngredient,
  RecipeStep,
  RecipeStepWithIngredients,
  RecipeWithIngredients,
} from "./types";

export async function getItems(kitchenId: number): Promise<Item[]> {
  const result = await getDb().execute({
    sql: "SELECT * FROM items WHERE kitchen_id = ? ORDER BY category NULLS LAST, name",
    args: [kitchenId],
  });
  return result.rows as unknown as Item[];
}

/**
 * The columns every recipe listing wants: the row, who wrote it, and what
 * people made of it. Ratings are averaged across everyone rather than being one
 * shared number, which is what having more than one household requires.
 */
const RECIPE_WITH_AUTHOR = `
  SELECT r.*, u.handle AS author_handle, u.display_name AS author_name,
         (SELECT ROUND(AVG(rating), 1) FROM recipe_ratings WHERE recipe_id = r.id) AS avg_rating,
         (SELECT COUNT(*) FROM recipe_ratings WHERE recipe_id = r.id) AS rating_count
  FROM recipes r
  LEFT JOIN users u ON u.id = r.author_id
`;

/** Your own collection - what the cook-from-stock panel ranks. */
export async function getMyRecipes(authorId: number): Promise<RecipeWithAuthor[]> {
  const result = await getDb().execute({
    sql: `${RECIPE_WITH_AUTHOR}
          WHERE r.author_id = ?
          ORDER BY r.times_cooked DESC, r.name`,
    args: [authorId],
  });
  return result.rows as unknown as RecipeWithAuthor[];
}

/**
 * Everything a person is allowed to see, newest first - the discover page.
 *
 * The visibility rule is in the WHERE clause rather than filtered afterwards,
 * so there is no version of this query that forgets it.
 */
export async function browseRecipes(
  viewerId: number,
  options: { authorId?: number; limit?: number } = {},
): Promise<RecipeWithAuthor[]> {
  const byAuthor = options.authorId ? "AND r.author_id = ?" : "";

  const result = await getDb().execute({
    sql: `${RECIPE_WITH_AUTHOR}
          WHERE ${VISIBLE_TO_VIEWER} ${byAuthor}
          ORDER BY r.id DESC
          LIMIT ?`,
    args: [
      ...viewerArgs(viewerId),
      ...(options.authorId ? [options.authorId] : []),
      options.limit ?? 60,
    ],
  });
  return result.rows as unknown as RecipeWithAuthor[];
}

/**
 * Just who wrote a recipe, with no visibility check.
 *
 * Attribution is a credit, not access. "Adapted from @someone" has to keep
 * working after they make the original private, or taking your copy private
 * would quietly erase the person you got it from.
 */
export async function getRecipeAuthorHandle(
  recipeId: number,
): Promise<{ id: number; handle: string } | null> {
  const result = await getDb().execute({
    sql: `SELECT u.id, u.handle FROM recipes r
          JOIN users u ON u.id = r.author_id
          WHERE r.id = ?`,
    args: [recipeId],
  });
  return (result.rows[0] as unknown as { id: number; handle: string }) ?? null;
}

/** Kept for the API, which lists what the calling account wrote. */
export async function getRecipes(authorId: number): Promise<Recipe[]> {
  return getMyRecipes(authorId);
}

export async function getRecipe(
  id: number,
  viewerId: number,
): Promise<RecipeWithIngredients | null> {
  // Four reads rather than one join: the join would multiply every ingredient
  // by every step that mentions it, and stitching the rows back apart in JS is
  // more code than fetching them separately.
  const [recipeResult, ingredientResult, stepResult, linkResult] = await Promise.all([
    getDb().execute({
      sql: `SELECT r.* FROM recipes r WHERE r.id = ? AND ${VISIBLE_TO_VIEWER}`,
      args: [id, ...viewerArgs(viewerId)],
    }),
    getDb().execute({
      sql: "SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY position, id",
      args: [id],
    }),
    getDb().execute({
      sql: "SELECT * FROM recipe_steps WHERE recipe_id = ? ORDER BY position, id",
      args: [id],
    }),
    getDb().execute({
      sql: `SELECT si.step_id, si.ingredient_id
            FROM recipe_step_ingredients si
            JOIN recipe_steps s ON s.id = si.step_id
            WHERE s.recipe_id = ?`,
      args: [id],
    }),
  ]);

  const recipe = recipeResult.rows[0] as unknown as Recipe | undefined;
  if (!recipe) return null;

  const ingredients = ingredientResult.rows as unknown as RecipeIngredient[];
  const byId = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));

  const usesByStep = new Map<number, RecipeIngredient[]>();
  for (const row of linkResult.rows as unknown as {
    step_id: number;
    ingredient_id: number;
  }[]) {
    const ingredient = byId.get(row.ingredient_id);
    if (!ingredient) continue;

    const bucket = usesByStep.get(row.step_id);
    if (bucket) bucket.push(ingredient);
    else usesByStep.set(row.step_id, [ingredient]);
  }

  const steps: RecipeStepWithIngredients[] = (
    stepResult.rows as unknown as RecipeStep[]
  ).map((step) => ({
    ...step,
    uses: (usesByStep.get(step.id) ?? []).sort((a, b) => a.position - b.position),
  }));

  return { ...recipe, ingredients, steps };
}

/** Item names currently in stock, lowercased, for recipe match indicators. */
export async function getStockedItemNames(kitchenId: number): Promise<Set<string>> {
  const result = await getDb().execute({
    sql: "SELECT name FROM items WHERE kitchen_id = ? AND quantity > 0",
    args: [kitchenId],
  });
  return new Set(
    (result.rows as unknown as { name: string }[]).map((r) => r.name.toLowerCase()),
  );
}

export interface RecipeWithMatch extends RecipeWithAuthor {
  /** Ingredient lines whose item is currently in stock. */
  have: number;
  total: number;
}

/**
 * Recipes ranked for the "cook with what you have" panel, each with a count of
 * how many of its lines are stocked *in this kitchen*. One query for all
 * ingredient lines rather than one per recipe.
 */
export async function getRecipesWithMatches(
  kitchenId: number,
  authorId: number,
): Promise<RecipeWithMatch[]> {
  const [recipes, stocked, ingredientRows] = await Promise.all([
    getMyRecipes(authorId),
    getStockedItemNames(kitchenId),
    getDb().execute("SELECT recipe_id, item_name FROM recipe_ingredients"),
  ]);

  const byRecipe = new Map<number, string[]>();
  for (const row of ingredientRows.rows as unknown as RecipeIngredient[]) {
    const bucket = byRecipe.get(row.recipe_id);
    if (bucket) bucket.push(row.item_name);
    else byRecipe.set(row.recipe_id, [row.item_name]);
  }

  return recipes.map((recipe) => {
    const names = byRecipe.get(recipe.id) ?? [];
    return {
      ...recipe,
      have: names.filter((name) => stocked.has(name.toLowerCase())).length,
      total: names.length,
    };
  });
}
