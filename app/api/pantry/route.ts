import { NextResponse } from "next/server";
import { LOCATIONS } from "@/lib/locations";
import { getItems, getRecipes } from "@/lib/queries";
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
export async function GET() {
  const [items, recipes] = await Promise.all([getItems(), getRecipes()]);

  return NextResponse.json(
    {
      generated_at: new Date().toISOString(),

      pantry: {
        items: items.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          // Always the canonical unit: stock is stored in one unit per
          // dimension so nothing downstream has to guess what a number means.
          unit: item.canonical_unit,
          dimension: item.dimension,
          category: item.category,
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
        locations: LOCATIONS,
        note: "Conversion only happens within a dimension. Grams never become millilitres - there is no density data here.",
      },

      writing_recipes: {
        method: "POST",
        url: "/api/recipes",
        auth: "Authorization: Bearer <token>",
        schema_version: RECIPE_SCHEMA_VERSION,
        schema: recipeJsonSchema(),
        response:
          "201 with { id, url, warnings } on success; 422 with { problems } if the document isn't a recipe. Warnings mean it was saved but something wants a human eye - usually an ingredient the pantry has never held.",
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
