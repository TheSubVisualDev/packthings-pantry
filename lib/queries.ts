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
