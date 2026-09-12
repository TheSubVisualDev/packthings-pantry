"use server";

import { revalidatePath } from "next/cache";
import { requireKitchenRole, requireUser } from "@/lib/session";
import {
  addToCookbook,
  proposeLinks,
  relink,
  removeFromCookbook,
  type LinkChoice,
  type ProposedLink,
} from "@/lib/cookbook";
import { tagRecipe, untagRecipe, type RecipeTag } from "@/lib/recipe-tags";

/**
 * Adopting a recipe is an editor's act, not a viewer's.
 *
 * It writes links that decide what cooking takes off the shelf, so somebody
 * who may look at a kitchen but not change it may not decide that either.
 */
export interface AdoptPreview {
  ok: boolean;
  error?: string;
  lines?: ProposedLink[];
}

/** What adding would link and what it would ask. Writes nothing. */
export async function previewAdoption(recipeId: number): Promise<AdoptPreview> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  return { ok: true, lines: await proposeLinks(access.kitchen.id, recipeId) };
}

export async function addRecipeToCookbook(
  recipeId: number,
  choices: LinkChoice[] = [],
): Promise<{ ok: boolean; error?: string; linked?: number }> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  const result = await addToCookbook(
    access.kitchen.id,
    recipeId,
    access.user.id,
    choices,
  );

  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/recipes");
  revalidatePath("/pantry");
  return { ok: true, linked: result.linked };
}

export async function removeRecipeFromCookbook(
  recipeId: number,
): Promise<{ ok: boolean; error?: string }> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  await removeFromCookbook(access.kitchen.id, recipeId);

  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/recipes");
  revalidatePath("/pantry");
  return { ok: true };
}

/**
 * Changes what one line means, after the fact.
 *
 * The escape hatch for a link that was agreed and turned out wrong - which
 * matters more than it sounds, because the alternative to being able to fix one
 * is removing the recipe and adding it again.
 */
export async function relinkIngredient(
  recipeId: number,
  ingredientId: number,
  itemId: number | null,
): Promise<{ ok: boolean; error?: string }> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  await relink(access.kitchen.id, ingredientId, itemId);

  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/pantry");
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
