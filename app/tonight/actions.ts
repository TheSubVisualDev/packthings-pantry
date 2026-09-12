"use server";

import { revalidatePath } from "next/cache";
import { cookRecipe, undoCook, type CookResult, type UndoResult } from "@/app/recipes/[id]/actions";
import { addLine, pendingNames, removeLine } from "@/lib/shopping";
import { requireKitchenRole } from "@/lib/session";

/** A line put on the shopping list by cooking, and the handle to take it off. */
export interface ListedLine {
  id: number;
  name: string;
}

export interface TonightCookResult extends CookResult {
  /**
   * What cooking finished off, already on the shopping list.
   *
   * Added rather than offered, because the moment a thing runs out is the only
   * moment anybody knows it has - and it is taken straight back off again by
   * undo, so the list never claims a cook that did not happen.
   */
  listed: ListedLine[];
}

/**
 * Cooking without opening the recipe.
 *
 * The suggestion on /tonight is already the whole answer, and making it a trip
 * through the recipe page to spend the stock meant the app knew what had been
 * cooked only when somebody could be bothered to tell it. Everything the cook
 * panel asks - servings, stand-ins, which lines were skipped - has a defensible
 * default, and the recipe is one tap away for the cook that needs them.
 */
export async function cookTonight(
  recipeId: number,
  servings: number,
): Promise<TonightCookResult> {
  const result = await cookRecipe(recipeId, servings);
  if (!result.ok) return { ...result, listed: [] };

  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ...result, listed: [] };

  /**
   * Run out means the shelf is empty, not the open container.
   *
   * `remaining` is what is left in the one that is open, which is zero every
   * time cooking finishes a packet with two more behind it.
   */
  const ranOut = [...result.applied, ...result.flagged].filter(
    (line) => line.item_id !== undefined && line.remaining_total === 0,
  );
  if (ranOut.length === 0) return { ...result, listed: [] };

  const already = await pendingNames(access.kitchen.id);
  const listed: ListedLine[] = [];
  for (const line of ranOut) {
    if (already.has(line.item_name.toLowerCase())) continue;
    const id = await addLine(access.kitchen.id, access.user.id, {
      name: line.item_name,
      quantity: null,
      unit: null,
      itemId: line.item_id,
    });
    listed.push({ id, name: line.item_name });
  }

  if (listed.length > 0) revalidatePath("/pantry/list");
  return { ...result, listed };
}

/**
 * Undo, including the shopping list.
 *
 * Putting the stock back and leaving "Spinach" on the list would be the app
 * remembering half of something that did not happen.
 */
export async function undoTonightCook(
  eventId: number,
  lineIds: number[],
): Promise<UndoResult> {
  const undone = await undoCook(eventId);
  if (!undone.ok) return undone;

  const access = await requireKitchenRole("editor");
  if (access.ok && lineIds.length > 0) {
    for (const id of lineIds) await removeLine(access.kitchen.id, id);
    revalidatePath("/pantry/list");
  }

  revalidatePath("/tonight");
  return undone;
}
