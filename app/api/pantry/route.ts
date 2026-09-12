import { NextResponse } from "next/server";
import { getLocations } from "@/lib/kitchens";
import { getItems, getRecipes } from "@/lib/queries";
import { getTagsByItem } from "@/lib/tags";
import { apiContext } from "@/lib/session";
import { recipeJsonSchema, RECIPE_SCHEMA_VERSION } from "@/lib/recipe-schema";
import { UNITS_BY_DIMENSION } from "@/lib/units";

export const dynamic = "force-dynamic";

/**
 * What's in the kitchen, in one JSON document, for a Claude session to reason
 * about.
 *
 * Self-describing on purpose. Alongside the stock it ships the legal units, the
 * kitchen's locations and the full schema for posting a recipe back, so a
 * caller is told what it may send rather than inferring it from examples and
 * inventing "cups". The proxy has already checked the bearer token by the time
 * this runs.
 */
export async function GET(request: Request) {
  const context = await apiContext(request);
  if (!context.ok) {
    return NextResponse.json({ error: "No account for this request" }, { status: 401 });
  }

  const [items, recipes, locations, tagsByItem] = await Promise.all([
    getItems(context.kitchen?.id ?? null),
    getRecipes(context.user.id),
    context.kitchen ? getLocations(context.kitchen.id) : Promise.resolve([]),
    getTagsByItem(context.kitchen?.id ?? null),
  ]);

  return NextResponse.json(
    {
      generated_at: new Date().toISOString(),

      // Null rather than absent, and said out loud: an account with no kitchen
      // can still write recipes, it just has no stock to check them against.
      kitchen: context.kitchen
        ? {
            id: context.kitchen.id,
            name: context.kitchen.name,
            your_role: context.kitchen.role,
          }
        : null,

      note: context.kitchen
        ? undefined
        : "This account has no kitchen yet, so pantry.items is empty. Recipes can still be written; their ingredients simply won't resolve to stock.",

      pantry: {
        items: items.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          // Always the canonical unit: stock is stored in one unit per
          // dimension so nothing downstream has to guess what a number means.
          unit: item.canonical_unit,
          dimension: item.dimension,
          tags: tagsByItem.get(item.id)?.map((tag) => tag.name) ?? [],
          location: item.location,
          expires: item.expiry_date,
        })),
      },

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
        locations,
        note: "Conversion only happens within a dimension. Grams never become millilitres - there is no density data here.",
      },

      writing_recipes: {
        method: "POST",
        url: "/api/recipes",
        auth: "Authorization: Bearer <token>",
        schema_version: RECIPE_SCHEMA_VERSION,
        schema: recipeJsonSchema(),
        response:
          "201 with { id, url, warnings } on success; 422 with { problems } if the document isn't a recipe. A warning of kind 'not-stocked' only means the kitchen has not bought that ingredient yet, which is normal and needs nothing done; 'unit-mismatch' and 'unknown-reference' are worth fixing.",
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
