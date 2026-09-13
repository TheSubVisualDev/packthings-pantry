import { getDb, plainRows } from "./db";

/**
 * The week: what is being cooked, and when.
 *
 * The pin this grew out of held one recipe per kitchen - "the trip" - which
 * answered "what am I shopping for right now" and nothing else. A tester asked
 * for the week, so a plan is many rows with a date and a slot, and the trip
 * becomes whichever one is nearest.
 *
 * Dates are days, not instants. A meal plan is about which evening you are
 * cooking on, which is a fact about the kitchen's calendar - a timestamp would
 * put Sunday's dinner on Monday for anybody an hour east of here. So every
 * date in this file is a 'YYYY-MM-DD' string and nothing here constructs a
 * Date from one without pinning it to noon first.
 */

/** Up to three, because more than three is a diary rather than a meal plan. */
export const MAX_SLOTS = 3;

/**
 * What a kitchen calls its meals.
 *
 * Dinner alone by default. Planning one meal a day is what most households
 * actually do, and opening a planner on twenty-one empty boxes is opening a
 * planner on homework.
 */
export const DEFAULT_SLOTS = ["Dinner"];

/** The names offered when somebody adds a slot, in the order days go. */
export const SLOT_SUGGESTIONS = ["Breakfast", "Lunch", "Dinner"];

export interface PlannedMeal {
  id: number;
  on_date: string;
  slot: number;
  recipe_id: number | null;
  /** "Leftovers", "Out" - a real answer about the week that is not a recipe. */
  note: string | null;
  servings: number | null;
  recipe_name: string | null;
  recipe_photo: string | null;
  recipe_servings: number | null;
}

/** One day of the week, with a place for every slot whether or not it is full. */
export interface PlannedDay {
  date: string;
  /** Indexed by slot, null where nothing is planned. */
  meals: (PlannedMeal | null)[];
}

/* -------------------------------------------------------------------------
   Dates, which are the part that goes wrong
   ------------------------------------------------------------------------- */

/** 'YYYY-MM-DD' for a Date, read in local time rather than UTC. */
export function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * A date from 'YYYY-MM-DD', at noon.
 *
 * Noon rather than midnight on purpose: `new Date("2026-03-29")` is parsed as
 * UTC, and on the morning the clocks go forward that is 01:00 local, which is
 * a different day in some zones and the same day at a different hour in
 * others. Noon is at least twelve hours from either edge, so adding days to it
 * cannot walk off the end of one.
 */
export function fromIso(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function addDays(iso: string, days: number): string {
  const date = fromIso(iso);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

/**
 * The Monday of the week a date falls in.
 *
 * Monday because this is a British app and a British week starts on one -
 * "what are we eating this week" is asked on a Sunday evening about the days
 * after it, not about the day itself.
 */
export function weekStart(iso: string): string {
  const date = fromIso(iso);
  // getDay is 0 for Sunday, so Sunday is six days into the week rather than
  // the start of the next one.
  const back = (date.getDay() + 6) % 7;
  return addDays(iso, -back);
}

/** The seven dates of the week beginning at `start`. */
export function weekDates(start: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

/** "Mon 14", for a column heading that has to fit on a phone. */
export function shortDay(iso: string): { day: string; number: string } {
  const date = fromIso(iso);
  return {
    day: date.toLocaleDateString("en-GB", { weekday: "short" }),
    number: String(date.getDate()),
  };
}

/** "week of 14 September", for saying which week is on screen. */
export function weekLabel(start: string): string {
  const from = fromIso(start);
  const to = fromIso(addDays(start, 6));
  const sameMonth = from.getMonth() === to.getMonth();

  const left = from.toLocaleDateString("en-GB", {
    day: "numeric",
    ...(sameMonth ? {} : { month: "short" }),
  });
  const right = to.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  return `${left} – ${right}`;
}

/* -------------------------------------------------------------------------
   Slots
   ------------------------------------------------------------------------- */

/**
 * The kitchen's meal names, from whatever is in the column.
 *
 * Forgiving on the way out because the column is free text in a database that
 * has been edited by hand before: anything that is not a usable list of one to
 * three names becomes the default rather than an error on a page somebody was
 * only trying to read.
 */
export function readSlots(stored: string | null | undefined): string[] {
  if (!stored) return DEFAULT_SLOTS;
  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return DEFAULT_SLOTS;

    const names = parsed
      .filter((name): name is string => typeof name === "string")
      .map((name) => name.trim().slice(0, 24))
      .filter(Boolean)
      .slice(0, MAX_SLOTS);

    return names.length > 0 ? names : DEFAULT_SLOTS;
  } catch {
    return DEFAULT_SLOTS;
  }
}

/** Strict on the way in: this is what gets written. */
export function cleanSlots(names: string[]): string[] {
  const cleaned = names
    .map((name) => name.trim().slice(0, 24))
    .filter(Boolean)
    .slice(0, MAX_SLOTS);
  return cleaned.length > 0 ? cleaned : DEFAULT_SLOTS;
}

export async function getSlots(kitchenId: number): Promise<string[]> {
  const result = await getDb().execute({
    sql: "SELECT meal_slots FROM kitchens WHERE id = ?",
    args: [kitchenId],
  });
  return readSlots(
    (result.rows[0] as unknown as { meal_slots: string | null } | undefined)?.meal_slots,
  );
}

export async function setSlots(kitchenId: number, names: string[]): Promise<string[]> {
  const cleaned = cleanSlots(names);
  await getDb().execute({
    sql: "UPDATE kitchens SET meal_slots = ? WHERE id = ?",
    args: [JSON.stringify(cleaned), kitchenId],
  });
  return cleaned;
}

/* -------------------------------------------------------------------------
   The plan
   ------------------------------------------------------------------------- */

/**
 * Everything planned between two dates, inclusive.
 *
 * A range rather than a week number so the same query serves the week grid,
 * the "what is nearest" lookup and anything later that wants a fortnight.
 */
export async function getPlanned(
  kitchenId: number,
  from: string,
  to: string,
): Promise<PlannedMeal[]> {
  const result = await getDb().execute({
    sql: `SELECT m.id, m.on_date, m.slot, m.recipe_id, m.note, m.servings,
                 r.name AS recipe_name, r.photo_url AS recipe_photo,
                 r.base_servings AS recipe_servings
          FROM meal_plan m
          LEFT JOIN recipes r ON r.id = m.recipe_id
          WHERE m.kitchen_id = ? AND m.on_date BETWEEN ? AND ?
          ORDER BY m.on_date, m.slot`,
    args: [kitchenId, from, to],
  });
  // Plain objects: the week grid is a client component. See plainRows.
  return plainRows<PlannedMeal>(result);
}

/** The week as seven days, each with a place for every slot. */
export async function getWeek(
  kitchenId: number,
  start: string,
  slotCount: number,
): Promise<PlannedDay[]> {
  const dates = weekDates(start);
  const planned = await getPlanned(kitchenId, dates[0], dates[6]);

  const byDay = new Map<string, PlannedMeal[]>();
  for (const meal of planned) {
    byDay.set(meal.on_date, [...(byDay.get(meal.on_date) ?? []), meal]);
  }

  return dates.map((date) => ({
    date,
    meals: Array.from({ length: slotCount }, (_, slot) => {
      // A meal left behind by a slot that has since been removed simply does
      // not appear. Kept in the table rather than deleted, so putting the slot
      // back brings the week back with it.
      return byDay.get(date)?.find((meal) => meal.slot === slot) ?? null;
    }),
  }));
}

/**
 * Puts something in a slot, replacing whatever was there.
 *
 * One statement rather than a delete and an insert, so two people planning the
 * same evening at once cannot both find it empty and both write. The UNIQUE on
 * (kitchen, date, slot) is what makes that work, and is why it exists.
 */
export async function planMeal(
  kitchenId: number,
  userId: number,
  meal: {
    date: string;
    slot: number;
    recipeId?: number | null;
    note?: string | null;
    servings?: number | null;
  },
): Promise<void> {
  const recipeId = meal.recipeId ?? null;
  const note = recipeId === null ? (meal.note?.trim() || "Something else") : null;

  await getDb().execute({
    sql: `INSERT INTO meal_plan (kitchen_id, on_date, slot, recipe_id, note, servings, added_by)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (kitchen_id, on_date, slot) DO UPDATE SET
            recipe_id = excluded.recipe_id,
            note      = excluded.note,
            servings  = excluded.servings,
            added_by  = excluded.added_by`,
    args: [
      kitchenId,
      meal.date,
      meal.slot,
      recipeId,
      note,
      meal.servings ?? null,
      userId,
    ],
  });
}

export async function clearMeal(
  kitchenId: number,
  date: string,
  slot: number,
): Promise<void> {
  await getDb().execute({
    sql: "DELETE FROM meal_plan WHERE kitchen_id = ? AND on_date = ? AND slot = ?",
    args: [kitchenId, date, slot],
  });
}

/** Moves a meal to another day and slot, taking whatever was there with it. */
export async function moveMeal(
  kitchenId: number,
  userId: number,
  from: { date: string; slot: number },
  to: { date: string; slot: number },
): Promise<void> {
  if (from.date === to.date && from.slot === to.slot) return;

  const planned = await getPlanned(kitchenId, from.date, from.date);
  const moving = planned.find((meal) => meal.slot === from.slot);
  if (!moving) return;

  const landing = (await getPlanned(kitchenId, to.date, to.date)).find(
    (meal) => meal.slot === to.slot,
  );

  // A swap rather than an overwrite. Dragging Thursday onto Tuesday when both
  // are full means you want them the other way round - dropping Tuesday's
  // dinner on the floor is never what was meant.
  await clearMeal(kitchenId, from.date, from.slot);
  await planMeal(kitchenId, userId, {
    date: to.date,
    slot: to.slot,
    recipeId: moving.recipe_id,
    note: moving.note,
    servings: moving.servings,
  });
  if (landing) {
    await planMeal(kitchenId, userId, {
      date: from.date,
      slot: from.slot,
      recipeId: landing.recipe_id,
      note: landing.note,
      servings: landing.servings,
    });
  }
}

/** Everything planned from today onwards in this week, soonest first. */
export async function whatIsNext(
  kitchenId: number,
  today: string,
): Promise<PlannedMeal | null> {
  const planned = await getPlanned(kitchenId, today, addDays(today, 7));
  return planned.find((meal) => meal.recipe_id !== null) ?? null;
}
