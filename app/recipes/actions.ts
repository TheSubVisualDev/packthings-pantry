"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getItems } from "@/lib/queries";
import { currentKitchen, requireUser } from "@/lib/session";
import {
  parseRecipeDocument,
  type RecipeProblem,
  type RecipeWarning,
} from "@/lib/recipe-schema";
import { deleteRecipe, saveRecipe } from "@/lib/recipe-store";
import { readRecipeText } from "@/lib/recipe-text";
import { splitAmount } from "@/lib/units";
import { record } from "@/lib/usage";
import { findRecipeText, type FoundIn } from "@/lib/video-import";

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

  /**
   * An edit to a recipe that is not yours is refused by the UPDATE itself, and
   * arrives here as a throw. Turned into a problem the editor can show rather
   * than a 500: the person is looking at a form full of their own typing.
   */
  let id: number;
  try {
    id = await saveRecipe(parsed.recipe, existingId, context.user.id);
  } catch (error) {
    if (error instanceof Error && error.message === "not-your-recipe") {
      return {
        ok: false,
        problems: [{ path: "", message: "That recipe belongs to somebody else." }],
        warnings: [],
      };
    }
    throw error;
  }

  // Only a new one. An edit is a different question - "is the editor used" -
  // and rolling the two together would make one heavily-revised recipe look
  // like a stream of people writing recipes.
  if (existingId === undefined) {
    record("recipe.create", context.user.id, "/recipes/new");
  }

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

/**
 * Deletes one of YOUR recipes.
 *
 * It had no authorisation of any kind - no session check, no owner - and every
 * exported function in a "use server" file is a live endpoint whether or not
 * anything in the UI calls it. So this was a way for any signed-in account to
 * delete any recipe in the network by its id, cascading to its ingredients,
 * its steps and its cook history.
 *
 * The owner now goes to deleteRecipe, which puts it in the WHERE clause. A
 * refusal reads the same as a missing recipe, deliberately: it should not
 * confirm that somebody else's private recipe exists.
 */
export async function removeRecipe(id: number): Promise<void> {
  const session = await requireUser();
  if (!session.ok) redirect("/login");

  if (!Number.isInteger(id) || id <= 0) redirect("/recipes");

  await deleteRecipe(id, session.user.id);
  revalidatePath("/recipes");
  redirect("/recipes");
}

export interface LinkResult {
  ok: boolean;
  error?: string;
  /** The text found, put in the box so it can be read, corrected, or thrown out. */
  text?: string;
  from?: FoundIn;
  title?: string;
  author?: string;
  url?: string;
  /** Text with no ingredient list in it - handed over, but said out loud. */
  thin?: boolean;
}

/**
 * Fetches the writing attached to a video link.
 *
 * It stops at the text on purpose. The fetched words go into the same box a
 * paste goes into, where they can be read and corrected before anything is
 * made of them - which matters most for the case this was asked for, a
 * transcript, where the words are a machine's guess at speech and the amounts
 * are the part it gets wrong. Nothing is written; nothing is even parsed until
 * somebody presses Read it.
 *
 * Not counted separately. A link is another way of getting a recipe in by
 * pasting, `recipe.paste` is recorded when the text is actually read, and a
 * second name for the same feature would split one count into two.
 */
export async function fetchRecipeLink(link: string): Promise<LinkResult> {
  const session = await requireUser();
  if (!session.ok) return { ok: false, error: "Sign in first." };

  if (!link.trim()) return { ok: false, error: "Paste a link first." };

  const found = await findRecipeText(link);
  if (!found.ok || !found.text) {
    return { ok: false, error: found.error ?? "Nothing to read at that link." };
  }

  return {
    ok: true,
    text: found.text,
    from: found.from,
    title: found.title,
    author: found.author,
    url: found.url,
    thin: found.thin,
  };
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
export async function readPastedText(
  text: string,
  /**
   * Where the text came from, when it was fetched rather than typed.
   *
   * Set on the document as its source so a recipe read off a video carries the
   * link home with it. It is an argument rather than something the reader
   * picks out of the text, because a line saying "Source: …" in a paste is a
   * line somebody wrote and this is a fact the app already knows.
   */
  source?: string,
): Promise<ReadPastedResult> {
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
  if (source && !read.document.source) read.document.source = source;

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

  // Counted on a successful read rather than on save: the question this
  // answers is whether pasting is how people get recipes in, and a paste that
  // was read and then abandoned still says yes to that.
  record("recipe.paste", context.user.id, "/recipes/paste");

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
