"use server";

import { revalidatePath } from "next/cache";
import { requireKitchenRole } from "@/lib/session";
import {
  addDays,
  cleanSlots,
  clearMeal,
  getPlanned,
  getSlots,
  isoDate,
  moveMeal,
  planMeal,
  setSlots,
  weekDates,
  weekStart,
} from "@/lib/plan";
import { getItems, getRecipe, getTonightFacts } from "@/lib/queries";
import { rankTonight } from "@/lib/tonight";
import { addLine, pendingNames, recipeShortfall } from "@/lib/shopping";
import { indexStock } from "@/lib/pantry-match";
import { getLinks } from "@/lib/cookbook";

export interface PlanResult {
  ok: boolean;
  error?: string;
  message?: string;
}

/** A day the planner will accept: a real 'YYYY-MM-DD', not a year from now. */
function readDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  /**
   * Reconstructed and compared, not just pattern-matched.
   *
   * "2026-02-31" passes the regex and rolls over to 3 March, so a plan written
   * for it would silently appear on a day nobody chose. Anything that does not
   * survive the round trip was not a date.
   */
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  const back = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  if (back !== value) return null;

  // Two years either side. Not a security boundary - it is what stops a typo
  // in a query string filing dinner in 3026 where nobody will ever find it.
  const now = Date.now();
  const two = 730 * 24 * 60 * 60 * 1000;
  if (Math.abs(date.getTime() - now) > two) return null;

  return value;
}

function readSlot(value: unknown, count: number): number | null {
  const slot = Number(value);
  if (!Number.isInteger(slot) || slot < 0 || slot >= count) return null;
  return slot;
}

/** Planning is changing the kitchen's week, so it needs the same role as stock. */
async function access() {
  return requireKitchenRole("editor");
}

export async function putInSlot(input: {
  date: string;
  slot: number;
  recipeId?: number | null;
  note?: string | null;
  servings?: number | null;
}): Promise<PlanResult> {
  const gate = await access();
  if (!gate.ok) return { ok: false, error: gate.error };

  const date = readDate(input.date);
  if (!date) return { ok: false, error: "That is not a day." };

  const slots = await getSlots(gate.kitchen.id);
  const slot = readSlot(input.slot, slots.length);
  if (slot === null) return { ok: false, error: "That meal is not set up." };

  await planMeal(gate.kitchen.id, gate.user.id, {
    date,
    slot,
    recipeId: input.recipeId ?? null,
    note: input.note ?? null,
    servings: input.servings ?? null,
  });

  revalidatePath("/plan");
  revalidatePath("/tonight");
  return { ok: true };
}

export async function emptySlot(date: string, slot: number): Promise<PlanResult> {
  const gate = await access();
  if (!gate.ok) return { ok: false, error: gate.error };

  const day = readDate(date);
  if (!day) return { ok: false, error: "That is not a day." };

  await clearMeal(gate.kitchen.id, day, slot);
  revalidatePath("/plan");
  revalidatePath("/tonight");
  return { ok: true };
}

export async function shiftMeal(
  from: { date: string; slot: number },
  to: { date: string; slot: number },
): Promise<PlanResult> {
  const gate = await access();
  if (!gate.ok) return { ok: false, error: gate.error };

  const fromDate = readDate(from.date);
  const toDate = readDate(to.date);
  if (!fromDate || !toDate) return { ok: false, error: "That is not a day." };

  await moveMeal(
    gate.kitchen.id,
    gate.user.id,
    { date: fromDate, slot: from.slot },
    { date: toDate, slot: to.slot },
  );

  revalidatePath("/plan");
  revalidatePath("/tonight");
  return { ok: true };
}

/** What this kitchen calls its meals. One to three names. */
export async function renameSlots(names: string[]): Promise<PlanResult> {
  const gate = await access();
  if (!gate.ok) return { ok: false, error: gate.error };

  const cleaned = cleanSlots(names);
  await setSlots(gate.kitchen.id, cleaned);

  revalidatePath("/plan");
  return {
    ok: true,
    message: `Planning ${cleaned.length === 1 ? cleaned[0].toLowerCase() : cleaned.join(", ").toLowerCase()}.`,
  };
}

/**
 * Copies a whole week onto the next one.
 *
 * The thing people actually do. Most weeks are mostly last week, and typing
 * the same five dinners in again is the reason a planner stops being used in
 * its third week. Only fills empty slots, so a next week already half planned
 * is not overwritten by a button labelled "copy".
 */
export async function copyWeekForward(start: string): Promise<PlanResult> {
  const gate = await access();
  if (!gate.ok) return { ok: false, error: gate.error };

  const from = readDate(start);
  if (!from || weekStart(from) !== from) {
    return { ok: false, error: "That is not the start of a week." };
  }

  const source = await getPlanned(gate.kitchen.id, from, addDays(from, 6));
  if (source.length === 0) {
    return { ok: false, error: "There is nothing in this week to copy." };
  }

  const nextStart = addDays(from, 7);
  const existing = await getPlanned(gate.kitchen.id, nextStart, addDays(nextStart, 6));
  const taken = new Set(existing.map((meal) => `${meal.on_date}:${meal.slot}`));

  let copied = 0;
  for (const meal of source) {
    const date = addDays(meal.on_date, 7);
    if (taken.has(`${date}:${meal.slot}`)) continue;

    await planMeal(gate.kitchen.id, gate.user.id, {
      date,
      slot: meal.slot,
      recipeId: meal.recipe_id,
      note: meal.note,
      servings: meal.servings,
    });
    copied += 1;
  }

  revalidatePath("/plan");
  return {
    ok: true,
    message:
      copied > 0
        ? `${copied} ${copied === 1 ? "meal" : "meals"} copied into next week.`
        : "Next week is already full.",
  };
}

/**
 * Fills every empty slot from here to Sunday with something worth cooking.
 *
 * The fun one, and it is not a random shuffle. It runs the same ranker
 * /tonight uses, which already knows what is about to go off, what the shelves
 * can supply and what was cooked recently - so a filled week uses up the
 * spinach, does not put Tuesday's dinner on Wednesday, and leans towards
 * things you can actually make.
 *
 * Only forwards. Filling in Monday on a Thursday would be the app writing down
 * a week that did not happen.
 */
export async function fillTheGaps(start: string): Promise<PlanResult> {
  const gate = await access();
  if (!gate.ok) return { ok: false, error: gate.error };

  const from = readDate(start);
  if (!from || weekStart(from) !== from) {
    return { ok: false, error: "That is not the start of a week." };
  }

  const slots = await getSlots(gate.kitchen.id);
  const today = isoDate(new Date());

  const [facts, planned] = await Promise.all([
    getTonightFacts(gate.kitchen.id, gate.user.id),
    getPlanned(gate.kitchen.id, from, addDays(from, 6)),
  ]);

  if (facts.length === 0) {
    return {
      ok: false,
      error: "Nothing in this kitchen's cookbook to choose from yet.",
    };
  }

  const taken = new Set(planned.map((meal) => `${meal.on_date}:${meal.slot}`));

  /**
   * What is already in the week, so the same dinner is not proposed twice.
   *
   * Counted from the whole week rather than only the days being filled: a
   * Monday you planned yourself is exactly the reason not to suggest the same
   * thing on Thursday, and the ranker cannot see the plan.
   */
  const used = new Set(
    planned
      .map((meal) => meal.recipe_id)
      .filter((id): id is number => id !== null),
  );

  const ranked = rankTonight(facts);
  let filled = 0;
  /**
   * Whether it stopped because it ran out of recipes rather than out of days.
   *
   * Worth saying. A cookbook of three recipes fills three days and leaves four
   * blank, and without a word about why that reads as the button half working.
   */
  let ranDry = false;

  for (const date of weekDates(from)) {
    // Today counts as ahead: somebody planning a week on Sunday evening means
    // to include Sunday's dinner.
    if (date < today) continue;

    for (let slot = 0; slot < slots.length; slot += 1) {
      if (taken.has(`${date}:${slot}`)) continue;

      const pick = ranked.find((candidate) => !used.has(candidate.id));
      // Fewer recipes than empty slots. The week fills as far as it can and
      // says how far, rather than going round the cookbook twice - a planner
      // that proposes the same dinner on Monday and Thursday has not
      // understood what it was asked.
      if (!pick) {
        ranDry = true;
        break;
      }

      await planMeal(gate.kitchen.id, gate.user.id, {
        date,
        slot,
        recipeId: pick.id,
      });
      used.add(pick.id);
      filled += 1;
    }
  }

  revalidatePath("/plan");
  revalidatePath("/tonight");

  if (filled === 0) {
    return { ok: false, error: "Nothing left to fill, or nothing new to fill it with." };
  }
  const days = `${filled} ${filled === 1 ? "day" : "days"} filled in`;
  return {
    ok: true,
    message: ranDry
      ? `${days} — that is every recipe in the cookbook once. Add more and the rest of the week fills too.`
      : `${days}, using up what expires soonest first.`,
  };
}

/**
 * Puts everything the week is short of onto the shopping list, in one go.
 *
 * One trip for seven dinners, which is how shopping actually works and is the
 * thing a paper meal plan cannot do. Every recipe is judged against the SAME
 * snapshot of the shelves, and a name spoken for by Monday is not listed again
 * for Thursday - otherwise a week with pasta twice in it asks you to buy pasta
 * twice.
 *
 * It does not add up the amounts across days. Two dinners needing 200g each is
 * not reliably 400g on a shelf that already holds 300g, and quietly doubling a
 * number somebody will act on in a shop is worse than listing it once and
 * letting them look.
 */
export async function shopForTheWeek(start: string): Promise<PlanResult> {
  const gate = await access();
  if (!gate.ok) return { ok: false, error: gate.error };

  const from = readDate(start);
  if (!from || weekStart(from) !== from) {
    return { ok: false, error: "That is not the start of a week." };
  }

  const today = isoDate(new Date());
  const planned = (await getPlanned(gate.kitchen.id, from, addDays(from, 6)))
    // Shopping for Monday on Thursday is shopping for a dinner already eaten.
    .filter((meal) => meal.recipe_id !== null && meal.on_date >= today);

  if (planned.length === 0) {
    return { ok: false, error: "Nothing left to shop for this week." };
  }

  const stock = await getItems(gate.kitchen.id);
  const shelves = {
    index: indexStock(stock),
    byId: new Map(stock.map((item) => [item.id, item])),
    links: new Map<number, number | null>(),
  };

  const already = await pendingNames({ kitchen: gate.kitchen.id });
  let added = 0;
  const shoppedFor: string[] = [];

  for (const meal of planned) {
    const recipe = await getRecipe(meal.recipe_id!, gate.user.id);
    if (!recipe) continue;

    // Per recipe, because the links that say which jar an ingredient means are
    // written when a recipe is adopted and are specific to it.
    shelves.links = await getLinks(gate.kitchen.id, recipe.id);

    const { wanted } = recipeShortfall(
      recipe,
      meal.servings ?? recipe.base_servings,
      shelves,
      already,
    );

    for (const line of wanted) {
      await addLine({ kitchen: gate.kitchen.id }, gate.user.id, {
        name: line.name,
        quantity: line.quantity,
        unit: line.unit,
        itemId: line.itemId,
        source: recipe.name,
      });
      added += 1;
    }
    if (wanted.length > 0) shoppedFor.push(recipe.name);
  }

  revalidatePath("/pantry/list");
  revalidatePath("/plan");

  if (added === 0) {
    return { ok: true, message: "You already have everything for this week." };
  }
  return {
    ok: true,
    message: `${added} ${added === 1 ? "thing" : "things"} added for ${shoppedFor.length} ${shoppedFor.length === 1 ? "meal" : "meals"}.`,
  };
}
