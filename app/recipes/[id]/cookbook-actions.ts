"use server";

import { revalidatePath } from "next/cache";
import { requireKitchenRole, requireUser } from "@/lib/session";
import { addToCookbook, removeFromCookbook } from "@/lib/cookbook";
import { tagRecipe, untagRecipe, type RecipeTag } from "@/lib/recipe-tags";

/**
 * Adopting a recipe is an editor's act, not a viewer's: it changes what the
 * kitchen's cookbook holds, and so what the week planner chooses from.
 *
 * There used to be two more endpoints here, previewAdoption and
 * relinkIngredient, which proposed and corrected which stock row each line
 * meant. v2 keeps no stock (18 Oct 2026), and an export from a "use server"
 * file is a live URL whether or not anything calls it, so they went rather
 * than being left unwired.
 */
export async function addRecipeToCookbook(
  recipeId: number,
): Promise<{ ok: boolean; error?: string }> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };
  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    return { ok: false, error: "Unknown recipe" };
  }

  await addToCookbook(access.kitchen.id, recipeId, access.user.id);

  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/recipes");
  revalidatePath("/plan");
  return { ok: true };
}

export async function removeRecipeFromCookbook(
  recipeId: number,
): Promise<{ ok: boolean; error?: string }> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  await removeFromCookbook(access.kitchen.id, recipeId);

  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/recipes");
  revalidatePath("/plan");
  return { ok: true };
}

/* ---------- tags ---------- */

/**
 * Tagging is the author's, not the kitchen's.
 *
 * recipe_tags is scoped to whoever wrote the recipe, so the permission check
 * here is authorship rather than a kitchen role - somebody with editor rights
 * on your kitchen still does not get to rename how you file your own recipes.
 */
export async function addRecipeTag(
  recipeId: number,
  name: string,
): Promise<{ ok: boolean; error?: string; tag?: RecipeTag }> {
  const user = await requireUser();
  if (!user.ok) return { ok: false, error: "Sign in first." };

  const tag = await tagRecipe(user.user.id, recipeId, name);
  if (!tag) return { ok: false, error: "Couldn't save that tag." };

  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/recipes");
  return { ok: true, tag };
}

export async function removeRecipeTag(
  recipeId: number,
  tagId: number,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!user.ok) return { ok: false, error: "Sign in first." };

  await untagRecipe(user.user.id, recipeId, tagId);

  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/recipes");
  return { ok: true };
}
