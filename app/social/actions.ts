"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getRecipe } from "@/lib/queries";
import { forkRecipe, setVisibility } from "@/lib/recipe-store";
import { follow, isVisibility, unfollow } from "@/lib/social";
import { getUserByHandle } from "@/lib/users";

export interface SocialResult {
  ok: boolean;
  error?: string;
}

export async function setFollowing(
  handle: string,
  following: boolean,
): Promise<SocialResult> {
  const session = await requireUser();
  if (!session.ok) return { ok: false, error: "Sign in first." };

  const subject = await getUserByHandle(handle);
  if (!subject) return { ok: false, error: "No such person." };

  if (following) await follow(session.user.id, subject.id);
  else await unfollow(session.user.id, subject.id);

  revalidatePath(`/people/${subject.handle}`);
  revalidatePath("/people");
  revalidatePath("/discover");
  return { ok: true };
}

/**
 * Changes who can see one of your recipes.
 *
 * setVisibility has the author in its WHERE clause, so this can only ever
 * affect your own - the check below is for the error message, not the safety.
 */
export async function publish(
  recipeId: number,
  visibility: string,
): Promise<SocialResult> {
  const session = await requireUser();
  if (!session.ok) return { ok: false, error: "Sign in first." };
  if (!isVisibility(visibility)) return { ok: false, error: "Unknown setting." };

  const changed = await setVisibility(recipeId, session.user.id, visibility);
  if (!changed) return { ok: false, error: "That isn't your recipe." };

  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/discover");
  return { ok: true };
}

/**
 * Takes a copy of someone else's recipe.
 *
 * Fetched through getRecipe with the viewer's id first, so a recipe you aren't
 * allowed to see can't be copied by guessing its number.
 */
export async function saveToMine(recipeId: number): Promise<SocialResult> {
  const session = await requireUser();
  if (!session.ok) return { ok: false, error: "Sign in first." };

  const visible = await getRecipe(recipeId, session.user.id);
  if (!visible) return { ok: false, error: "No such recipe." };
  if (visible.author_id === session.user.id) {
    return { ok: false, error: "This one's already yours." };
  }

  const copy = await forkRecipe(recipeId, session.user.id);
  if (!copy) return { ok: false, error: "Couldn't copy that." };

  revalidatePath("/recipes");
  redirect(`/recipes/${copy}`);
}
