"use server";

import { revalidatePath } from "next/cache";
import { pin } from "@/lib/trip";
import { listAccess, requireKitchenRole } from "@/lib/session";
import { getItems, getRecipe } from "@/lib/queries";
import {
  addLine,
  clearBought,
  getRestockSuggestions,
  pendingNames,
  recipeShortfall,
  removeLine,
  setBought,
} from "@/lib/shopping";
import { scaleQuantity } from "@/lib/units";
import { getLinks } from "@/lib/cookbook";
import { indexStock } from "@/lib/pantry-match";
import { record } from "@/lib/usage";

export interface ListResult {
  ok: boolean;
  error?: string;
  message?: string;
}

/**
 * Whose list is being edited.
 *
 * A kitchen's needs the same role as its stock. Somebody with no kitchen gets
 * their own list rather than a refusal - see listAccess. Everything on this
 * page that only compares the list to shelves still needs a kitchen, and says
 * so where it is used.
 */
async function access() {
  return listAccess();
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

  await addLine(gate.scope, gate.user.id, {
    name,
    quantity,
    unit: quantity === null ? null : String(formData.get("unit") ?? "g"),
  });

  record("shopping.add", gate.user.id, "/pantry/list");

  revalidatePath("/pantry/list");
  return { ok: true };
}

export async function tick(lineId: number, bought: boolean): Promise<ListResult> {
  const gate = await access();
  if (!gate.ok) return { ok: false, error: gate.error };

  await setBought(gate.scope, lineId, bought);
  // Only the tick, not the untick: crossing a line off is the thing being
  // counted, and un-crossing one is a correction to it.
  if (bought) record("shopping.tick", gate.user.id, "/pantry/list");

  revalidatePath("/pantry/list");
  return { ok: true };
}

export async function drop(lineId: number): Promise<ListResult> {
  const gate = await access();
  if (!gate.ok) return { ok: false, error: gate.error };

  await removeLine(gate.scope, lineId);
  revalidatePath("/pantry/list");
  return { ok: true };
}

export async function clearDone(): Promise<ListResult> {
  const gate = await access();
  if (!gate.ok) return { ok: false, error: gate.error };

  const gone = await clearBought(gate.scope);
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

  /**
   * No kitchen means no shelves, which means everything is short.
   *
   * Not a lesser version of the answer - it is the correct one. Somebody
   * without a kitchen browsing a recipe and wanting to shop for it wants the
   * whole ingredient list, written as the recipe writes it, and every
   * comparison below this point would be comparing against nothing.
   */
  if (!gate.kitchen) {
    const already = await pendingNames(gate.scope);
    let listed = 0;

    for (const line of recipe.ingredients) {
      if (line.optional === 1) continue;
      if (already.has(line.item_name.toLowerCase())) continue;

      await addLine(gate.scope, gate.user.id, {
        name: line.item_name,
        quantity: scaleQuantity(line.quantity, recipe.base_servings, servings),
        unit: line.unit,
        source: recipe.name,
      });
      listed += 1;
    }

    revalidatePath("/pantry/list");
    return {
      ok: true,
      message:
        listed > 0
          ? `${listed} ${listed === 1 ? "thing" : "things"} added for ${recipe.name}.`
          : "It is all on the list already.",
    };
  }

  /**
   * One snapshot of the shelves, judged by the same helper the week planner
   * uses. This was a hundred lines here, and a second copy of "what does this
   * recipe cost me" is a second place for the container rule to be got wrong -
   * which AGENTS.md keeps a count of, and the count is five.
   */
  const stock = await getItems(gate.kitchen.id);

  const { wanted, alreadyListed } = recipeShortfall(
    recipe,
    servings,
    {
      index: indexStock(stock),
      byId: new Map(stock.map((item) => [item.id, item])),
      links: await getLinks(gate.kitchen.id, recipeId),
    },
    await pendingNames(gate.scope),
  );

  for (const line of wanted) {
    await addLine(gate.scope, gate.user.id, {
      name: line.name,
      quantity: line.quantity,
      unit: line.unit,
      itemId: line.itemId,
      source: recipe.name,
    });
  }

  const added = wanted.length;

  /**
   * Asking what a recipe is short of is saying you intend to cook it.
   *
   * So it becomes the trip: the stock screen says what you are shopping for,
   * the list is for it, and coming home offers to cook it. Pinned even when
   * nothing needed adding - "I have everything for this" is still a decision
   * about tonight, and it is the case where the ready-to-cook button is
   * immediately true.
   */
  await pin(gate.kitchen.id, recipeId, gate.user.id);

  // The recipe page, not the list: the same action fires from three buttons in
  // three places, and where it was pressed is the interesting half.
  record("shopping.add", gate.user.id, `/recipes/${recipeId}`);

  revalidatePath("/pantry/list");
  revalidatePath("/pantry");
  revalidatePath("/tonight");

  if (added > 0) {
    return {
      ok: true,
      message: `${added} ${added === 1 ? "thing" : "things"} added. Shopping for ${recipe.name}.`,
    };
  }

  // Nothing added covers two different situations, and telling someone they
  // have everything when the shortfall is simply already on the list would be
  // a lie they'd act on.
  return {
    ok: true,
    message:
      alreadyListed > 0
        ? `Already on the list${alreadyListed === 1 ? "" : ` (${alreadyListed} of them)`}.`
        : "You already have everything.",
  };
}

/**
 * Puts everything that has fallen below its keep-on-hand number onto the list.
 *
 * All of them at once rather than one button per row: the whole reason to set a
 * target is not having to decide again every week. Each line carries the pack
 * size, so "2" reads as two bottles rather than a bare number.
 *
 * Takes the same shop filter the panel is showing, so "Add all N" adds the N
 * it just showed - not every suggestion in the kitchen regardless of which
 * shop you're standing in.
 */
export async function addRestock(filter?: string | null): Promise<ListResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  const suggestions = await getRestockSuggestions(access.kitchen.id, filter ?? null);
  if (suggestions.length === 0) {
    return { ok: false, error: "Nothing is below its target." };
  }

  for (const suggestion of suggestions) {
    await addLine({ kitchen: access.kitchen.id }, access.user.id, {
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
