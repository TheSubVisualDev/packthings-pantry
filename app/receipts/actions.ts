"use server";

import { revalidatePath } from "next/cache";
import { parseReceipt, tidyName } from "@/lib/receipt";
import { findShop, receiptMeta } from "@/lib/receipt-meta";
import {
  addLine,
  createReceipt,
  deleteLine,
  deleteReceipt,
  getCategories,
  getHousehold,
  mealIdFor,
  setEaters,
  setLineMeals,
  setReceiptStatus,
  shopIdFor,
  updateLine,
  updateReceipt,
  type LinePatch,
  type ReceiptPatch,
} from "@/lib/receipt-db";
import { readReceiptImage, MAX_IMAGE_BYTES } from "@/lib/receipt-vision";
import { MEAL_KINDS, readPence, type MealKind } from "@/lib/receipts";
import { requireKitchenRole } from "@/lib/session";
import { record } from "@/lib/usage";

/**
 * Every export here is a live endpoint, reachable by anybody past the auth
 * gate whether or not a component calls it (AGENTS.md). So each one asks for
 * an editor's role itself and hands the kitchen to lib/receipt-db, which puts
 * it in the WHERE clause - an id from another kitchen simply matches nothing.
 */

/** More text than any till produces; past this it is not a receipt. */
const MAX_TEXT = 100_000;

export interface SaveResult {
  ok: boolean;
  error?: string;
  id?: number;
}

function refresh(id?: number) {
  revalidatePath("/receipts");
  revalidatePath("/spend");
  if (id) revalidatePath(`/receipts/${id}`);
}

/**
 * A receipt from its text - what the phone's OCR read, or what somebody pasted.
 *
 * Saved straight away, even when it read badly. In v1 nothing was written
 * until every line had been checked, because a wrong line put rubbish on a
 * shelf; here a wrong line is a line on a receipt that can be fixed or
 * deleted on the receipt's own page, which is where the checking happens
 * anyway. Saving first means a receipt half-done at the till is not lost.
 */
export async function saveReceiptText(text: string): Promise<SaveResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };
  if (typeof text !== "string" || text.trim().length === 0) {
    return { ok: false, error: "Nothing was readable on that." };
  }

  const clipped = text.slice(0, MAX_TEXT);
  const lines = parseReceipt(clipped);
  if (lines.length === 0) {
    return {
      ok: false,
      error: "Nothing on that looked like shopping. A flatter, brighter photo usually does it.",
    };
  }

  const id = await createReceipt(access.kitchen.id, access.user.id, {
    meta: receiptMeta(clipped),
    lines: lines.map((line) => ({ raw: line.raw, name: line.name, pence: line.price, count: line.count })),
    rawText: clipped,
  });
  record("receipt.add", access.user.id, "/receipts/new");
  refresh(id);
  return { ok: true, id };
}

/**
 * A receipt from a photo, read by a vision model.
 *
 * The fallback for when the phone's own reading came back thin. The photo is
 * not kept: it carries the last four digits of somebody's card, and the
 * lines it produced are the record.
 */
export async function saveReceiptPhoto(form: FormData): Promise<SaveResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  const file = form.get("photo");
  if (!(file instanceof File) || !file.type.startsWith("image/")) {
    return { ok: false, error: "That isn't a photo." };
  }
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "That photo is too big to send." };

  const read = await readReceiptImage(new Uint8Array(await file.arrayBuffer()), file.type);
  if (!read.ok || !read.meta || !read.lines) return { ok: false, error: read.error };

  // A model says "Tesco Superstore Didsbury"; the shop list wants "Tesco".
  const meta = { ...read.meta, shop: read.meta.shop ? findShop(read.meta.shop) ?? read.meta.shop : null };

  const id = await createReceipt(access.kitchen.id, access.user.id, {
    meta,
    lines: read.lines.map((line) => ({
      raw: line.raw,
      name: tidyName(line.raw.replace(/^\d{4,}\s+/, "")),
      pence: line.pence,
      count: line.count,
    })),
    rawText: read.lines.map((line) => line.raw).join("\n"),
  });
  record("receipt.add", access.user.id, "/receipts/new");
  record("receipt.ai", access.user.id, "/receipts/new");
  refresh(id);
  return { ok: true, id };
}

/**
 * An empty receipt, to be typed in.
 *
 * Sam's other way in: "manual data entry - which isn't too bad, just takes
 * more time, and I can guarantee the information is correct". Today's date
 * and the person typing as the purchaser, since that is who has the receipt
 * in their hand most of the time; both are one tap to change.
 */
export async function startTypedReceipt(): Promise<SaveResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const id = await createReceipt(access.kitchen.id, access.user.id, {
    meta: { boughtOn: today, shop: null, cardLast4: null, totalPence: null },
    lines: [],
    rawText: null,
  });
  await updateReceipt(access.kitchen.id, id, { purchaser_id: access.user.id });
  record("receipt.add", access.user.id, "/receipts/new");
  refresh(id);
  return { ok: true, id };
}

export interface FactsInput {
  bought_on?: string | null;
  shop?: string | null;
  purchaser_id?: number | null;
  card_last4?: string | null;
  total?: string | null;
  note?: string | null;
}

/** A receipt's own facts, each checked before it is believed. */
export async function updateReceiptFacts(id: number, input: FactsInput): Promise<SaveResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };
  const kitchenId = access.kitchen.id;
  const patch: ReceiptPatch = {};

  if ("bought_on" in input) {
    const day = input.bought_on ?? null;
    if (day !== null && !/^20\d{2}-\d{2}-\d{2}$/.test(day)) return { ok: false, error: "That isn't a date." };
    patch.bought_on = day;
  }
  if ("shop" in input) {
    patch.shop_id = input.shop ? await shopIdFor(kitchenId, input.shop) : null;
  }
  if ("purchaser_id" in input) {
    const who = input.purchaser_id ?? null;
    if (who !== null) {
      const household = await getHousehold(kitchenId);
      if (!household.some((person) => person.id === who)) {
        return { ok: false, error: "They aren't in this kitchen." };
      }
    }
    patch.purchaser_id = who;
  }
  if ("card_last4" in input) {
    const card = (input.card_last4 ?? "").trim();
    if (card !== "" && !/^\d{4}$/.test(card)) return { ok: false, error: "Four digits, the end of the card." };
    patch.card_last4 = card || null;
  }
  if ("total" in input) {
    const text = (input.total ?? "").trim();
    const pence = text === "" ? null : readPence(text);
    if (text !== "" && pence === null) return { ok: false, error: "That isn't an amount." };
    patch.total_pence = pence;
  }
  if ("note" in input) {
    patch.note = (input.note ?? "").trim().slice(0, 500) || null;
  }

  await updateReceipt(kitchenId, id, patch);
  refresh(id);
  return { ok: true };
}

export interface LineInput {
  name?: string;
  price?: string | null;
  count?: number;
  amount?: number | null;
  unit?: string | null;
  category_id?: number | null;
  long_term?: boolean;
  snack?: boolean;
  used_whole?: boolean;
  use_by?: string | null;
}

const UNITS = new Set(["g", "ml", "count"]);

function linePatch(input: LineInput): LinePatch | string {
  const patch: LinePatch = {};
  if (input.name !== undefined) {
    const name = input.name.replace(/\s+/g, " ").trim().slice(0, 80);
    if (!name) return "It needs a name.";
    patch.name = name;
  }
  if (input.price !== undefined) {
    const text = (input.price ?? "").trim();
    const pence = text === "" ? null : readPence(text);
    if (text !== "" && pence === null) return "That isn't a price.";
    patch.pence = pence;
  }
  if (input.count !== undefined) {
    if (!Number.isInteger(input.count) || input.count < 1 || input.count > 99) return "Between 1 and 99.";
    patch.count = input.count;
  }
  if (input.amount !== undefined) {
    if (input.amount !== null && !(Number.isFinite(input.amount) && input.amount > 0)) return "That isn't an amount.";
    patch.amount = input.amount;
  }
  if (input.unit !== undefined) {
    if (input.unit !== null && !UNITS.has(input.unit)) return "That isn't a unit.";
    patch.unit = input.unit;
  }
  if (input.category_id !== undefined) patch.category_id = input.category_id;
  if (input.long_term !== undefined) patch.long_term = input.long_term ? 1 : 0;
  if (input.snack !== undefined) patch.snack = input.snack ? 1 : 0;
  if (input.used_whole !== undefined) patch.used_whole = input.used_whole ? 1 : 0;
  if (input.use_by !== undefined) {
    if (input.use_by !== null && !/^20\d{2}-\d{2}-\d{2}$/.test(input.use_by)) return "That isn't a date.";
    patch.use_by = input.use_by;
  }
  return patch;
}

export async function editLine(receiptId: number, lineId: number, input: LineInput): Promise<SaveResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };
  const patch = linePatch(input);
  if (typeof patch === "string") return { ok: false, error: patch };

  /**
   * A category id from somebody else's kitchen would file this line under a
   * name this kitchen cannot see. The foreign key would accept it, so the
   * check is here.
   */
  if (patch.category_id != null) {
    const mine = await getCategories(access.kitchen.id);
    if (!mine.some((category) => category.id === patch.category_id)) {
      return { ok: false, error: "That category isn't this kitchen's." };
    }
  }

  await updateLine(access.kitchen.id, lineId, patch);
  record("receipt.line", access.user.id, "/receipts");
  refresh(receiptId);
  return { ok: true };
}

export async function addReceiptLine(
  receiptId: number,
  input: { name: string; price: string; count?: number },
): Promise<SaveResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };
  const name = (input.name ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!name) return { ok: false, error: "It needs a name." };
  const text = (input.price ?? "").trim();
  const pence = text === "" ? null : readPence(text);
  if (text !== "" && pence === null) return { ok: false, error: "That isn't a price." };
  const count = Number.isInteger(input.count) && (input.count ?? 0) > 0 ? Math.min(99, input.count ?? 1) : 1;

  // Typed by hand, so there is no till wording: raw stays null, and nothing is
  // learned from it - the next receipt will not print "chicken thighs".
  const id = await addLine(access.kitchen.id, receiptId, { raw: null, name, pence, count });
  if (id === null) return { ok: false, error: "That receipt isn't here any more." };
  refresh(receiptId);
  return { ok: true, id };
}

export async function removeLine(receiptId: number, lineId: number): Promise<SaveResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };
  await deleteLine(access.kitchen.id, lineId);
  refresh(receiptId);
  return { ok: true };
}

export async function setLineEaters(receiptId: number, lineId: number, people: number[]): Promise<SaveResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };
  if (!Array.isArray(people) || people.some((id) => !Number.isInteger(id))) {
    return { ok: false, error: "Those aren't people." };
  }
  await setEaters(access.kitchen.id, lineId, people.slice(0, 20));
  record("receipt.line", access.user.id, "/receipts");
  refresh(receiptId);
  return { ok: true };
}

/**
 * Which meals a line went to, making a meal if it is named for the first time.
 *
 * Naming a meal while tagging is the only way most meals will ever be made -
 * nobody is going to visit a meals page first and set up "ramen" before
 * putting a receipt away.
 */
export async function setLineMealTags(
  receiptId: number,
  lineId: number,
  mealIds: number[],
  newMeal?: { name: string; kind?: MealKind },
): Promise<SaveResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };
  const ids = Array.isArray(mealIds) ? mealIds.filter((id) => Number.isInteger(id)).slice(0, 10) : [];
  if (newMeal?.name) {
    const kind = newMeal.kind && MEAL_KINDS.includes(newMeal.kind) ? newMeal.kind : "riff";
    const made = await mealIdFor(access.kitchen.id, newMeal.name, kind);
    if (made !== null) ids.push(made);
  }
  await setLineMeals(access.kitchen.id, lineId, ids);
  record("receipt.line", access.user.id, "/receipts");
  refresh(receiptId);
  revalidatePath("/meals");
  return { ok: true };
}

/** "I can no longer annotate this receipt" - Sam's words for closing one. */
export async function closeReceipt(id: number): Promise<SaveResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };
  await setReceiptStatus(access.kitchen.id, id, "closed");
  record("receipt.close", access.user.id, "/receipts");
  refresh(id);
  return { ok: true };
}

export async function reopenReceipt(id: number): Promise<SaveResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };
  await setReceiptStatus(access.kitchen.id, id, "open");
  refresh(id);
  return { ok: true };
}

export async function removeReceipt(id: number): Promise<SaveResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };
  await deleteReceipt(access.kitchen.id, id);
  refresh();
  return { ok: true };
}
