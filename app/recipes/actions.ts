"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getItems } from "@/lib/queries";
import { currentKitchen } from "@/lib/session";
import {
  parseRecipeDocument,
  type RecipeProblem,
  type RecipeWarning,
} from "@/lib/recipe-schema";
import { deleteRecipe, saveRecipe } from "@/lib/recipe-store";

export interface SaveRecipeResult {
  ok: boolean;
  id?: number;
  problems: RecipeProblem[];
  warnings: RecipeWarning[];
}

/**
 * Saves a recipe written in the editor.
 *
 * The editor hands over the same document shape the API accepts and it goes
 * through the same parse, so a recipe typed by hand and one posted by Claude
 * are validated identically. The editor could check as it goes, but a second
 * implementation of "what is a valid recipe" is a second thing to be wrong.
 */
export async function saveRecipeDocument(
  document: unknown,
  existingId?: number,
): Promise<SaveRecipeResult> {
  const context = await currentKitchen();
  if (!context.ok) {
    return { ok: false, problems: [{ path: "", message: "Sign in first." }], warnings: [] };
  }

  const parsed = parseRecipeDocument(
    document,
    await getItems(context.kitchen?.id ?? null),
  );

  if (!parsed.ok || !parsed.recipe) {
    return { ok: false, problems: parsed.problems, warnings: parsed.warnings };
  }

  const id = await saveRecipe(parsed.recipe, existingId, context.user.id);

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${id}`);
  revalidatePath("/pantry");

  return { ok: true, id, problems: [], warnings: parsed.warnings };
}

/** Parses pasted JSON before it reaches the editor, so bad input never loads. */
export async function parsePastedRecipe(text: string): Promise<SaveRecipeResult> {
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    return {
      ok: false,
      problems: [{ path: "", message: "That isn't valid JSON." }],
      warnings: [],
    };
  }

  const context = await currentKitchen();
  if (!context.ok) {
    return { ok: false, problems: [{ path: "", message: "Sign in first." }], warnings: [] };
  }

  const parsed = parseRecipeDocument(
    document,
    await getItems(context.kitchen?.id ?? null),
  );
  return {
    ok: parsed.ok,
    problems: parsed.problems,
    warnings: parsed.warnings,
  };
}

export async function removeRecipe(id: number): Promise<void> {
  await deleteRecipe(id);
  revalidatePath("/recipes");
  redirect("/recipes");
}
