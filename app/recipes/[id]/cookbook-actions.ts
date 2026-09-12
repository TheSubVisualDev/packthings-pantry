"use server";

import { revalidatePath } from "next/cache";
import { requireKitchenRole } from "@/lib/session";
import {
  addToCookbook,
  proposeLinks,
  relink,
  removeFromCookbook,
  type LinkChoice,
  type ProposedLink,
} from "@/lib/cookbook";

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
