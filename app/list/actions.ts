"use server";

import { revalidatePath } from "next/cache";
import { listAccess } from "@/lib/session";
import { getRecipe } from "@/lib/queries";
import {
  addLine,
  clearBought,
  pendingNames,
  recipeShortfall,
  removeLine,
  setBought,
  tickLines,
} from "@/lib/shopping";
import { record } from "@/lib/usage";

export interface ListResult {
  ok: boolean;
  error?: string;
  message?: string;
}

/**
 * Whose list is being edited.
 *
 * A kitchen's needs an editor. Somebody with no kitchen gets their own list
 * rather than a refusal - see listAccess. Nothing here needs a kitchen any
 * more: everything that did compared the list to shelves, and v2 has none.
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

  record("shopping.add", gate.user.id, "/list");

  revalidatePath("/list");
  return { ok: true };
}

export async function tick(lineId: number, bought: boolean): Promise<ListResult> {
  const gate = await access();
  if (!gate.ok) return { ok: false, error: gate.error };

  await setBought(gate.scope, lineId, bought);
  // Only the tick, not the untick: crossing a line off is the thing being
  // counted, and un-crossing one is a correction to it.
  if (bought) record("shopping.tick", gate.user.id, "/list");

  revalidatePath("/list");
  return { ok: true };
}

export async function drop(lineId: number): Promise<ListResult> {
  const gate = await access();
  if (!gate.ok) return { ok: false, error: gate.error };

  await removeLine(gate.scope, lineId);
  revalidatePath("/list");
  return { ok: true };
}

export async function clearDone(): Promise<ListResult> {
  const gate = await access();
  if (!gate.ok) return { ok: false, error: gate.error };

  const gone = await clearBought(gate.scope);
  revalidatePath("/list");
  return { ok: true, message: `${gone} cleared.` };
}

/**
 * The checkout, as one button.
 *
 * Ticking eleven things off at the till is eleven taps in a queue with a
 * basket in one hand. The lines ticked are the ones that were on screen, by
 * id, rather than "everything": a list that grew on another phone while you
 * were in the shop should not have the new line ticked off unseen.
 *
 * It used to need a kitchen, because it sat beside "put these away", which
 * moved stock. With that gone, a personal list gets it too.
 */
export async function gotEverything(
  lineIds: number[],
): Promise<ListResult & { ticked?: number }> {
  const gate = await access();
  if (!gate.ok) return { ok: false, error: gate.error };

  const ids = Array.isArray(lineIds)
    ? [...new Set(lineIds.filter((id) => Number.isInteger(id) && id > 0))].slice(0, 500)
    : [];
  if (ids.length === 0) return { ok: true, ticked: 0 };

  const ticked = await tickLines(gate.scope, ids);
  revalidatePath("/list");
  return { ok: true, ticked };
}

/** One line offered on the shopping checklist. */
export interface ChecklistLine {
  /** What to send back to say "this one". Opaque to the browser. */
  key: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  /** The recipe it is for, said on the line when there is more than one. */
  source: string;
}

export interface ChecklistPreview {
  ok: boolean;
  error?: string;
  lines?: ChecklistLine[];
  /** Lines left out because they are already waiting to be bought. */
  alreadyListed?: number;
}

/** A checklist key: which recipe line, so the server can find it again. */
function keyFor(recipeId: number, ingredientId: number): string {
  return `${recipeId}:${ingredientId}`;
}

/**
 * What shopping for a recipe would add, for the person to untick from.
 *
 * Writes nothing. With no stock (v2) the app cannot know what is already in
 * the cupboard, so it offers every line ticked and lets the one person who
 * does know untick the rest - see recipeShortfall.
 */
export async function previewShortfall(
  recipeId: number,
  servings: number,
): Promise<ChecklistPreview> {
  const gate = await access();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!Number.isFinite(servings) || servings <= 0 || servings > 100) {
    return { ok: false, error: "That is not a serving count." };
  }

  const recipe = await getRecipe(recipeId, gate.user.id);
  if (!recipe) return { ok: false, error: "No such recipe." };

  const { wanted, alreadyListed } = recipeShortfall(
    recipe,
    servings,
    await pendingNames(gate.scope),
  );

  return {
    ok: true,
    alreadyListed,
    lines: wanted.map((line) => ({
      key: keyFor(recipe.id, line.ingredientId),
      name: line.name,
      quantity: line.quantity,
      unit: line.unit,
      source: recipe.name,
    })),
  };
}

/**
 * Puts the lines somebody left ticked onto the list.
 *
 * Recomputed here from the recipe rather than taken from the browser: the
 * keys say which lines, and the names and amounts come from the same
 * recipeShortfall the preview used. A checklist that sat open while somebody
 * else added half of it to the list therefore cannot add it twice.
 */
export async function addShortfall(
  recipeId: number,
  servings: number,
  keys: string[],
): Promise<ListResult> {
  const gate = await access();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!Number.isFinite(servings) || servings <= 0 || servings > 100) {
    return { ok: false, error: "That is not a serving count." };
  }

  const recipe = await getRecipe(recipeId, gate.user.id);
  if (!recipe) return { ok: false, error: "No such recipe." };

  const chosen = new Set(Array.isArray(keys) ? keys.filter((key) => typeof key === "string") : []);
  const { wanted, alreadyListed } = recipeShortfall(
    recipe,
    servings,
    await pendingNames(gate.scope),
  );

  let added = 0;
  for (const line of wanted) {
    if (!chosen.has(keyFor(recipe.id, line.ingredientId))) continue;
    await addLine(gate.scope, gate.user.id, {
      name: line.name,
      quantity: line.quantity,
      unit: line.unit,
      source: recipe.name,
    });
    added += 1;
  }

  // The recipe page, not the list: the same action is offered in more than
  // one place, and where it was pressed is the interesting half.
  if (added > 0) record("shopping.add", gate.user.id, `/recipes/${recipeId}`);

  revalidatePath("/list");

  if (added > 0) {
    return {
      ok: true,
      message: `${added} ${added === 1 ? "thing" : "things"} added for ${recipe.name}.`,
    };
  }
  // Nothing added covers different situations, and saying the wrong one is a
  // claim somebody would act on in a shop.
  return {
    ok: true,
    message:
      chosen.size === 0
        ? "Nothing ticked, so nothing added."
        : alreadyListed > 0
          ? "It is all on the list already."
          : "Nothing to add.",
  };
}
