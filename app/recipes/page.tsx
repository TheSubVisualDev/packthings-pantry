import Link from "next/link";
import { getRecipes, getStockedItemNames } from "@/lib/queries";
import { db } from "@/lib/db";
import type { RecipeIngredient } from "@/lib/types";

export const dynamic = "force-dynamic";

function Stars({ rating }: { rating: number | null }) {
  if (rating === null) {
    return <span className="text-xs text-muted-foreground">Unrated</span>;
  }
  return (
    <span
      className="text-sm text-amber-500"
      aria-label={`Rated ${rating} out of 5`}
    >
      {"★".repeat(rating)}
      <span className="text-muted-foreground/40">
        {"★".repeat(5 - rating)}
      </span>
    </span>
  );
}

export default async function RecipesPage() {
  const [recipes, stocked] = await Promise.all([
    getRecipes(),
    getStockedItemNames(),
  ]);

  // One query for every ingredient line, then bucket by recipe - avoids an
  // N+1 round trip per recipe just to compute the pantry-match count.
  const ingredientRows = await db.execute(
    "SELECT recipe_id, item_name FROM recipe_ingredients",
  );
  const byRecipe = new Map<number, RecipeIngredient[]>();
  for (const row of ingredientRows.rows as unknown as RecipeIngredient[]) {
    const bucket = byRecipe.get(row.recipe_id);
    if (bucket) bucket.push(row);
    else byRecipe.set(row.recipe_id, [row]);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Recipes</h1>
        <span className="shrink-0 text-sm text-muted-foreground">
          {recipes.length} {recipes.length === 1 ? "recipe" : "recipes"}
        </span>
      </div>

      {recipes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No recipes yet.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {recipes.map((recipe) => {
            const ingredients = byRecipe.get(recipe.id) ?? [];
            const have = ingredients.filter((line) =>
              stocked.has(line.item_name.toLowerCase()),
            ).length;
            const missing = ingredients.length - have;

            return (
              <li key={recipe.id}>
                <Link
                  href={`/recipes/${recipe.id}`}
                  className="flex h-full flex-col gap-2 rounded-lg border p-4 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 break-words font-medium">
                      {recipe.name}
                    </span>
                    <Stars rating={recipe.rating} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>Serves {recipe.base_servings}</span>
                    <span>
                      {have}/{ingredients.length} in stock
                    </span>
                    {missing > 0 && (
                      <span className="text-amber-600 dark:text-amber-500">
                        {missing} missing
                      </span>
                    )}
                    {recipe.times_cooked > 0 && (
                      <span>Cooked {recipe.times_cooked}&times;</span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
