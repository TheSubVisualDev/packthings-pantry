import { getDb } from "./db";
import type { Item, Recipe, RecipeIngredient, RecipeWithIngredients } from "./types";

export async function getItems(): Promise<Item[]> {
  const result = await getDb().execute(
    "SELECT * FROM items ORDER BY category NULLS LAST, name",
  );
  return result.rows as unknown as Item[];
}

export async function getRecipes(): Promise<Recipe[]> {
  // Shared household rating drives the ranking; unrated recipes sort last.
  const result = await getDb().execute(
    "SELECT * FROM recipes ORDER BY rating DESC NULLS LAST, times_cooked DESC, name",
  );
  return result.rows as unknown as Recipe[];
}

export async function getRecipe(id: number): Promise<RecipeWithIngredients | null> {
  const [recipeResult, ingredientResult] = await Promise.all([
    getDb().execute({ sql: "SELECT * FROM recipes WHERE id = ?", args: [id] }),
    getDb().execute({
      sql: "SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY id",
      args: [id],
    }),
  ]);

  const recipe = recipeResult.rows[0] as unknown as Recipe | undefined;
  if (!recipe) return null;

  return {
    ...recipe,
    ingredients: ingredientResult.rows as unknown as RecipeIngredient[],
  };
}

/** Item names currently in stock, lowercased, for recipe match indicators. */
export async function getStockedItemNames(): Promise<Set<string>> {
  const result = await getDb().execute("SELECT name FROM items WHERE quantity > 0");
  return new Set(
    (result.rows as unknown as { name: string }[]).map((r) => r.name.toLowerCase()),
  );
}

export interface RecipeWithMatch extends Recipe {
  /** Ingredient lines whose item is currently in stock. */
  have: number;
  total: number;
}

/**
 * Recipes ranked for the "cook with what you have" panel, each with a count of
 * how many of its lines are currently stocked. One query for all ingredient
 * lines rather than one per recipe.
 */
export async function getRecipesWithMatches(): Promise<RecipeWithMatch[]> {
  const [recipes, stocked, ingredientRows] = await Promise.all([
    getRecipes(),
    getStockedItemNames(),
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
