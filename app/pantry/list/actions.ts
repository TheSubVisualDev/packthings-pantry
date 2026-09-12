"use server";

import { revalidatePath } from "next/cache";
import { requireKitchenRole } from "@/lib/session";
import { getRecipe } from "@/lib/queries";
import {
  addLine,
  clearBought,
  getRestockSuggestions,
  pendingNames,
  removeLine,
  setBought,
} from "@/lib/shopping";
import { resolveAmount, scaleQuantity } from "@/lib/units";
import { getLinks, resolveWithLinks } from "@/lib/cookbook";
import { indexStock } from "@/lib/pantry-match";
import { totalOnHand } from "@/lib/containers";
import { getDb } from "@/lib/db";
import type { Item } from "@/lib/types";

export interface ListResult {
  ok: boolean;
  error?: string;
  message?: string;
}

/** The list belongs to the kitchen, so editing it needs the same role as stock. */
async function access() {
  return requireKitchenRole("editor");
}

export async function addItemToList(
  _previous: ListResult,
  formData: FormData,
): Promise<ListResult> {
  const gate = await access();
  if (!gate.ok) return { ok: false, error: gate.error };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "What are you buying?" };

  const rawQuantity = String(formData.get("quantity") ?? "").trim();
  const quantity = rawQuantity ? Number(rawQuantity) : null;
  if (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0)) {
    return { ok: false, error: "That quantity doesn't look right." };
  }

  await addLine(gate.kitchen.id, gate.user.id, {
    name,
    quantity,
    unit: quantity === null ? null : String(formData.get("unit") ?? "g"),
  });

  revalidatePath("/pantry/list");
  return { ok: true };
}

export async function tick(lineId: number, bought: boolean): Promise<ListResult> {
  const gate = await access();
  if (!gate.ok) return { ok: false, error: gate.error };

  await setBought(gate.kitchen.id, lineId, bought);
  revalidatePath("/pantry/list");
  return { ok: true };
}

export async function drop(lineId: number): Promise<ListResult> {
  const gate = await access();
  if (!gate.ok) return { ok: false, error: gate.error };

  await removeLine(gate.kitchen.id, lineId);
  revalidatePath("/pantry/list");
  return { ok: true };
}

export async function clearDone(): Promise<ListResult> {
  const gate = await access();
  if (!gate.ok) return { ok: false, error: gate.error };

  const gone = await clearBought(gate.kitchen.id);
  revalidatePath("/pantry/list");
  return { ok: true, message: `${gone} cleared.` };
}

/**
 * Puts everything a recipe is short of onto the list.
 *
 * Recomputed here from stock rather than taken from whatever the page was
 * showing: the numbers on screen may be minutes old, and the point of the list
 * is what's missing now.
 */
export async function addShortfall(
  recipeId: number,
  servings: number,
): Promise<ListResult> {
  const gate = await access();
  if (!gate.ok) return { ok: false, error: gate.error };

  const recipe = await getRecipe(recipeId, gate.user.id);
  if (!recipe) return { ok: false, error: "No such recipe." };

  const stock = await getDb().execute({
    sql: "SELECT * FROM items WHERE kitchen_id = ?",
    args: [gate.kitchen.id],
  });
  const items = stock.rows as unknown as Item[];

  /**
   * What each line means on these shelves.
   *
   * This was the last place still matching by lowercased name, and against
   * recipe_ingredients.item_id - the column that belongs to whichever kitchen
   * happened to be current when the recipe was written. So a shared recipe
   * could compare your shortfall against somebody else's cupboard, and "firm
   * tofu" against a row called "Tofu" was always a thing to buy.
   */
  const index = indexStock(items);
  const byId = new Map(items.map((item) => [item.id, item]));
  const links = await getLinks(gate.kitchen.id, recipeId);

  const already = await pendingNames(gate.kitchen.id);
  let added = 0;
  let onList = 0;

  for (const line of recipe.ingredients) {
    if (line.optional === 1) continue;
    if (already.has(line.item_name.toLowerCase())) {
      // Already waiting to be bought. Left alone rather than topped up: the
      // amount on the list is one a person may have already adjusted.
      onList += 1;
      continue;
    }

    const { item } = resolveWithLinks(line, links, index, byId);

    const wanted = scaleQuantity(line.quantity, recipe.base_servings, servings);

    // Nothing in stock under that name: buy it, without pretending to know
    // how much of it the shelf already has.
    if (!item) {
      await addLine(gate.kitchen.id, gate.user.id, {
        name: line.item_name,
        quantity: wanted,
        unit: line.unit,
        source: recipe.name,
      });
      added += 1;
      continue;
    }

    const needed = resolveAmount(
      wanted,
      line.unit,
      { size: line.pack_size, unit: line.pack_unit },
      item.dimension,
    );

    // An unconvertible line can't be compared to stock, so it goes on the list
    // as written and the human decides.
    if (!needed.ok) {
      await addLine(gate.kitchen.id, gate.user.id, {
        name: line.item_name,
        quantity: wanted,
        unit: line.unit,
        itemId: item.id,
        source: recipe.name,
      });
      added += 1;
      continue;
    }

    /**
     * Everything on the shelf, not just the open container.
     *
     * `quantity` has meant "what is in the OPEN one" since containers arrived,
     * so this used to put things on the shopping list that were already in the
     * cupboard: two sealed bottles behind an empty one read as empty. The
     * fifth instance of the bug AGENTS.md keeps a count of.
     *
     * Unspecified means "there is some and nobody has said how much", which is
     * not a number you can subtract - so it is left off the list rather than
     * guessed at, the same as everywhere else.
     */
    const onHand = totalOnHand(item);
    if (onHand === null) continue;

    const short = needed.quantity - onHand;
    if (short <= 0) continue;

    await addLine(gate.kitchen.id, gate.user.id, {
      name: item.name,
      quantity: Math.ceil(short * 100) / 100,
      unit: item.canonical_unit,
      itemId: item.id,
      source: recipe.name,
    });
    added += 1;
  }

  revalidatePath("/pantry/list");

  if (added > 0) {
    return {
      ok: true,
      message: `${added} ${added === 1 ? "thing" : "things"} added to the list.`,
    };
  }

  // Nothing added covers two different situations, and telling someone they
  // have everything when the shortfall is simply already on the list would be
  // a lie they'd act on.
  return {
    ok: true,
    message:
      onList > 0
        ? `Already on the list${onList === 1 ? "" : ` (${onList} of them)`}.`
        : "You already have everything.",
  };
}

/**
 * Puts everything that has fallen below its keep-on-hand number onto the list.
 *
 * All of them at once rather than one button per row: the whole reason to set a
 * target is not having to decide again every week. Each line carries the pack
 * size, so "2" reads as two bottles rather than a bare number.
 */
export async function addRestock(): Promise<ListResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  const suggestions = await getRestockSuggestions(access.kitchen.id);
  if (suggestions.length === 0) {
    return { ok: false, error: "Nothing is below its target." };
  }

  for (const suggestion of suggestions) {
    await addLine(access.kitchen.id, access.user.id, {
      name: suggestion.name,
      // Whole packs when it comes in packs, the amount when it does not.
      // "1 pack" is something you pick up; "4 eggs" is something you count out
      // of a box that only comes in sixes.
      quantity: suggestion.packs ?? suggestion.short,
      unit:
        suggestion.packs !== null
          ? "pack"
          : suggestion.canonical_unit === "count"
            ? null
            : suggestion.canonical_unit,
      itemId: suggestion.item_id,
      source: "running low",
    });
  }

  revalidatePath("/pantry/list");
  revalidatePath("/pantry");
  return {
    ok: true,
    message: `Added ${suggestions.length} ${suggestions.length === 1 ? "thing" : "things"}.`,
  };
}
