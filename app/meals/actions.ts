"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireKitchenRole } from "@/lib/session";
import { deleteMeal, getMeal, mealIdFor, updateMeal } from "@/lib/receipt-db";
import { getCookbookRecipes } from "@/lib/queries";
import { MEAL_KINDS, type MealKind } from "@/lib/receipts";

export interface MealResult {
  ok: boolean;
  error?: string;
}

function readKind(value: unknown): MealKind | null {
  return MEAL_KINDS.includes(value as MealKind) ? (value as MealKind) : null;
}

/**
 * A new meal, and straight to its page.
 *
 * mealIdFor is INSERT OR IGNORE, so naming one that already exists lands you
 * on that one rather than refusing - which is what somebody typing "ramen"
 * a second time wanted anyway.
 */
export async function createMeal(_previous: MealResult, formData: FormData): Promise<MealResult> {
  const context = await requireKitchenRole("editor");
  if (!context.ok) return { ok: false, error: context.error };
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Give it a name." };
  const id = await mealIdFor(context.kitchen.id, name, readKind(formData.get("kind")) ?? "riff");
  if (!id) return { ok: false, error: "That didn't save." };
  revalidatePath("/meals");
  redirect(`/meals/${id}`);
}

export async function saveMeal(
  id: number,
  patch: { name?: string; notes?: string | null },
): Promise<MealResult> {
  const context = await requireKitchenRole("editor");
  if (!context.ok) return { ok: false, error: context.error };
  const clean: { name?: string; notes?: string | null } = {};
  if (typeof patch.name === "string") clean.name = patch.name;
  if (patch.notes !== undefined) {
    const notes = typeof patch.notes === "string" ? patch.notes.trim().slice(0, 2000) : "";
    clean.notes = notes || null;
  }
  try {
    await updateMeal(context.kitchen.id, Number(id), clean);
  } catch {
    // The unique index on the name, in practice the only way this throws.
    return { ok: false, error: "There is already a meal called that." };
  }
  revalidatePath("/meals");
  revalidatePath(`/meals/${id}`);
  return { ok: true };
}

export async function setMealKind(id: number, kind: string): Promise<MealResult> {
  const context = await requireKitchenRole("editor");
  if (!context.ok) return { ok: false, error: context.error };
  const valid = readKind(kind);
  if (!valid) return { ok: false, error: "That isn't a kind of meal." };
  await updateMeal(context.kitchen.id, Number(id), { kind: valid });
  revalidatePath("/meals");
  revalidatePath(`/meals/${id}`);
  return { ok: true };
}

/**
 * Points a meal at a real recipe, or at none.
 *
 * updateMeal scopes the MEAL to the kitchen but would store any recipe id it
 * was handed, and getMeals joins the recipe's name back out - so an
 * unchecked id would be a way to read the title of somebody's private recipe.
 * Only recipes in this kitchen's cookbook, as this person can see them, are
 * accepted.
 */
export async function linkRecipe(id: number, recipeId: number | null): Promise<MealResult> {
  const context = await requireKitchenRole("editor");
  if (!context.ok) return { ok: false, error: context.error };
  if (recipeId !== null) {
    const cookbook = await getCookbookRecipes(context.kitchen.id, context.user.id);
    if (!cookbook.some((recipe) => recipe.id === Number(recipeId))) {
      return { ok: false, error: "That recipe isn't in this kitchen's cookbook." };
    }
  }
  await updateMeal(context.kitchen.id, Number(id), {
    recipe_id: recipeId === null ? null : Number(recipeId),
  });
  revalidatePath("/meals");
  revalidatePath(`/meals/${id}`);
  return { ok: true };
}

export async function removeMeal(id: number): Promise<MealResult> {
  const context = await requireKitchenRole("editor");
  if (!context.ok) return { ok: false, error: context.error };
  // Read back first only to know whether there was anything to delete; the
  // delete itself carries the kitchen in its own WHERE.
  if (!(await getMeal(context.kitchen.id, Number(id)))) return { ok: false, error: "That meal has gone already." };
  await deleteMeal(context.kitchen.id, Number(id));
  revalidatePath("/meals");
  redirect("/meals");
}
