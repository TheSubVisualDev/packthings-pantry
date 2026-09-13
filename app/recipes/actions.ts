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
import { readRecipeText } from "@/lib/recipe-text";
import { splitAmount } from "@/lib/units";

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

/** What the text reader made of a paste, plus what it would be worth saying. */
export interface ReadPastedResult {
  ok: boolean;
  /** The document, held by the browser until somebody presses Add. */
  document?: Record<string, unknown>;
  /** A line or two per thing it had to guess at. */
  notes: string[];
  /** Lines it could not place. Shown so nothing disappears quietly. */
  unread: string[];
  problems: RecipeProblem[];
  warnings: RecipeWarning[];
  /** Enough to show what it understood without re-reading it in the browser. */
  preview?: {
    name: string;
    servings: number;
    lines: { amount: string; name: string; note: string | null }[];
    steps: number;
  };
}

/**
 * Reads a recipe pasted as ordinary text.
 *
 * Nothing is written. The reader guesses, and a guess should be looked at
 * before it becomes a recipe - so this returns what it understood and the
 * browser holds it until somebody agrees. Saving goes through
 * saveRecipeDocument like everything else; there is still one definition of
 * what a valid recipe is.
 */
export async function readPastedText(text: string): Promise<ReadPastedResult> {
  const context = await currentKitchen();
  if (!context.ok) {
    return {
      ok: false,
      notes: [],
      unread: [],
      problems: [{ path: "", message: "Sign in first." }],
      warnings: [],
    };
  }

  if (!text.trim()) {
    return {
      ok: false,
      notes: [],
      unread: [],
      problems: [{ path: "", message: "Nothing pasted yet." }],
      warnings: [],
    };
  }

  const read = readRecipeText(text);
  const parsed = parseRecipeDocument(
    read.document,
    await getItems(context.kitchen?.id ?? null),
  );

  if (!parsed.ok || !parsed.recipe) {
    return {
      ok: false,
      notes: read.notes,
      unread: read.unread,
      problems: parsed.problems,
      warnings: parsed.warnings,
    };
  }

  return {
    ok: true,
    document: read.document,
    notes: read.notes,
    unread: read.unread,
    problems: [],
    warnings: parsed.warnings,
    preview: {
      name: parsed.recipe.name,
      servings: parsed.recipe.base_servings,
      lines: parsed.recipe.ingredients.map((line) => ({
        amount: splitAmount(
          line.quantity,
          line.unit,
          { size: line.pack_size, unit: line.pack_unit },
          line.approx,
        ).primary,
        name: line.item_name,
        note: line.note,
      })),
      steps: parsed.recipe.steps.length,
    },
  };
}
