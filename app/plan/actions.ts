"use server";

import { revalidatePath } from "next/cache";
import { requireKitchenRole } from "@/lib/session";
import {
  addDays,
  cleanSlots,
  clearMeal,
  getPlanned,
  getSlots,
  moveMeal,
  planMeal,
  setSlots,
  weekStart,
} from "@/lib/plan";

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
