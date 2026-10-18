import { NextResponse } from "next/server";
import { getCookbookRecipes, getRecipes } from "@/lib/queries";
import { getList } from "@/lib/shopping";
import { apiContext } from "@/lib/session";
import { recipeJsonSchema, RECIPE_SCHEMA_VERSION } from "@/lib/recipe-schema";
import { UNITS_BY_DIMENSION } from "@/lib/units";

export const dynamic = "force-dynamic";

/**
 * The kitchen, in one JSON document, for a Claude session to reason about.
 *
 * Still at /api/pantry, because callers already have the address. It used to
 * be the stock list; v2 stopped tracking stock (18 Oct 2026), so it is now the
 * kitchen's cookbook, its open shopping list and your own recipes - and it
 * says, in `stock_tracked: false`, that it does not know what is in the
 * cupboard, so nothing reading it mistakes the list for the shelf.
 *
 * Self-describing on purpose. It ships the legal units and the full schema
 * for posting a recipe back, so a caller is told what it may send rather than
 * inferring it from examples and inventing "cups". The proxy has already
 * checked the bearer token by the time this runs.
 */
export async function GET(request: Request) {
  const context = await apiContext(request);
  if (!context.ok) {
    return NextResponse.json({ error: "No account for this request" }, { status: 401 });
  }

  const [cookbook, list, recipes] = await Promise.all([
    getCookbookRecipes(context.kitchen?.id ?? null, context.user.id),
    getList(
      context.kitchen ? { kitchen: context.kitchen.id } : { owner: context.user.id },
    ),
    getRecipes(context.user.id),
  ]);

  return NextResponse.json(
    {
      generated_at: new Date().toISOString(),

      // Null rather than absent, and said out loud: an account with no kitchen
      // can still write recipes and keep a list, it just has no cookbook.
      kitchen: context.kitchen
        ? {
            id: context.kitchen.id,
            name: context.kitchen.name,
            your_role: context.kitchen.role,
          }
        : null,

      stock_tracked: false,
      note: context.kitchen
        ? "This app does not record what is in the cupboard. shopping_list is what somebody means to buy, not what is there."
        : "This account has no kitchen yet, so cookbook is empty and shopping_list is a personal one. Recipes can still be written.",

      cookbook: cookbook.map((recipe) => ({
        id: recipe.id,
        name: recipe.name,
        times_cooked: recipe.times_cooked,
        url: `/api/recipes/${recipe.id}`,
      })),

      shopping_list: list
        .filter((line) => !line.bought_at)
        .map((line) => ({
          name: line.item_name,
          quantity: line.quantity,
          unit: line.unit,
          for: line.source,
        })),

      recipes: recipes.map((recipe) => ({
        id: recipe.id,
        name: recipe.name,
        description: recipe.description,
        base_servings: recipe.base_servings,
        prep_minutes: recipe.prep_minutes,
        cook_minutes: recipe.cook_minutes,
        rating: recipe.rating,
        times_cooked: recipe.times_cooked,
        url: `/api/recipes/${recipe.id}`,
      })),

      vocabulary: {
        units: UNITS_BY_DIMENSION,
        note: "Conversion only happens within a dimension. Grams never become millilitres - there is no density data here.",
      },

      writing_recipes: {
        method: "POST",
        url: "/api/recipes",
        auth: "Authorization: Bearer <token>",
        schema_version: RECIPE_SCHEMA_VERSION,
        schema: recipeJsonSchema(),
        response:
          "201 with { id, url, warnings } on success; 422 with { problems } if the document isn't a recipe. Warnings (kind 'unknown-reference': a step naming an ingredient the recipe does not list) are worth fixing.",
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
