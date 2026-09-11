"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getRecipe } from "@/lib/queries";
import { forkRecipe, setVisibility } from "@/lib/recipe-store";
import { block, follow, isVisibility, unblock, unfollow } from "@/lib/social";
import { getDb } from "@/lib/db";
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
 * Takes a copy of a recipe to work on.
 *
 * Works on your own as well as other people's, which is the point of calling
 * it a remix rather than a save: the commonest reason to copy a recipe is to
 * try it differently, and that is as true of something you wrote as of
 * something you found. Your own copy gets "(remix)" on the end, because two
 * identical names in one list help nobody.
 *
 * Fetched through getRecipe with the viewer's id first, so a recipe you are
 * not allowed to see cannot be copied by guessing its number.
 *
 * The copy starts private regardless of what the original was. Publishing is
 * a decision, and inheriting it from somebody else's recipe would make it by
 * accident.
 */
export async function remix(recipeId: number): Promise<SocialResult> {
  const session = await requireUser();
  if (!session.ok) return { ok: false, error: "Sign in first." };

  const visible = await getRecipe(recipeId, session.user.id);
  if (!visible) return { ok: false, error: "No such recipe." };

  const yours = visible.author_id === session.user.id;
  const copy = await forkRecipe(recipeId, session.user.id, (name) =>
    yours ? `${name} (remix)` : name,
  );
  if (!copy) return { ok: false, error: "Couldn't copy that." };

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${recipeId}`);
  redirect(`/recipes/${copy}`);
}

/**
 * Likes. Visibility is checked first, so a recipe you can't see can't be liked
 * by guessing its number - the same reasoning as ratings.
 */
export async function setLiked(
  recipeId: number,
  liked: boolean,
): Promise<SocialResult> {
  const session = await requireUser();
  if (!session.ok) return { ok: false, error: "Sign in first." };

  const visible = await getRecipe(recipeId, session.user.id);
  if (!visible) return { ok: false, error: "No such recipe." };

  if (liked) {
    await getDb().execute({
      sql: `INSERT INTO recipe_likes (recipe_id, user_id) VALUES (?, ?)
            ON CONFLICT DO NOTHING`,
      args: [recipeId, session.user.id],
    });
  } else {
    await getDb().execute({
      sql: "DELETE FROM recipe_likes WHERE recipe_id = ? AND user_id = ?",
      args: [recipeId, session.user.id],
    });
  }

  revalidatePath(`/recipes/${recipeId}`);
  return { ok: true };
}

export async function comment(
  recipeId: number,
  body: string,
): Promise<SocialResult> {
  const session = await requireUser();
  if (!session.ok) return { ok: false, error: "Sign in first." };

  const text = body.trim();
  if (!text) return { ok: false, error: "Say something first." };
  if (text.length > 1000) return { ok: false, error: "That's longer than 1000 characters." };

  const visible = await getRecipe(recipeId, session.user.id);
  if (!visible) return { ok: false, error: "No such recipe." };

  await getDb().execute({
    sql: "INSERT INTO recipe_comments (recipe_id, user_id, body) VALUES (?, ?, ?)",
    args: [recipeId, session.user.id, text],
  });

  revalidatePath(`/recipes/${recipeId}`);
  return { ok: true };
}

/**
 * Removes a comment.
 *
 * Yours to delete, or anyone's on a recipe you wrote - the author of a page is
 * the person who has to live with what's on it.
 */
export async function removeComment(commentId: number): Promise<SocialResult> {
  const session = await requireUser();
  if (!session.ok) return { ok: false, error: "Sign in first." };

  const result = await getDb().execute({
    sql: `DELETE FROM recipe_comments
          WHERE id = ?
            AND (
              user_id = ?
              OR recipe_id IN (SELECT id FROM recipes WHERE author_id = ?)
            )`,
    args: [commentId, session.user.id, session.user.id],
  });

  if (result.rowsAffected === 0) return { ok: false, error: "Not yours to delete." };

  revalidatePath("/recipes", "layout");
  return { ok: true };
}

export async function setBlocked(
  handle: string,
  blocked: boolean,
): Promise<SocialResult> {
  const session = await requireUser();
  if (!session.ok) return { ok: false, error: "Sign in first." };

  const subject = await getUserByHandle(handle);
  if (!subject) return { ok: false, error: "No such person." };

  if (blocked) await block(session.user.id, subject.id);
  else await unblock(session.user.id, subject.id);

  revalidatePath("/", "layout");
  return { ok: true };
}
