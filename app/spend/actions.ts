"use server";

import { revalidatePath } from "next/cache";
import { requireKitchenRole } from "@/lib/session";
import { record } from "@/lib/usage";
import { addSettlement, deleteSettlement } from "@/lib/receipt-db";
import { readPence } from "@/lib/receipts";
import { addListLine, readDay } from "@/lib/spend-db";
import { londonToday } from "@/lib/dates";

export interface SpendResult {
  ok: boolean;
  error?: string;
  message?: string;
}

/**
 * The people in a payment come from the form, so they are only ever a
 * request: addSettlement refuses anyone outside the kitchen's household, and
 * the kitchen itself comes from the session, never from the client.
 */
async function savePayment(payment: { from_user: number; to_user: number; pence: number; on_date: string; note?: string | null }): Promise<SpendResult> {
  const context = await requireKitchenRole("editor");
  if (!context.ok) return { ok: false, error: context.error };
  if (payment.from_user === payment.to_user) return { ok: false, error: "Pick two different people." };
  if (!(payment.pence > 0)) return { ok: false, error: "How much was it?" };
  const saved = await addSettlement(context.kitchen.id, context.user.id, payment);
  if (!saved) return { ok: false, error: "Both people need to be in this kitchen." };
  record("spend.settle", context.user.id, "/spend");
  revalidatePath("/spend");
  return { ok: true };
}

/** One of the suggested payments, made. Dated today, because that is when it was said. */
export async function markPaid(from: number, to: number, pence: number): Promise<SpendResult> {
  return savePayment({
    from_user: Number(from),
    to_user: Number(to),
    pence: Math.round(Number(pence)),
    on_date: londonToday(),
  });
}

export async function recordPayment(_previous: SpendResult, formData: FormData): Promise<SpendResult> {
  const pence = readPence(String(formData.get("amount") ?? ""));
  if (pence === null) return { ok: false, error: "That isn't an amount - try 12.40." };
  const rawDate = String(formData.get("on_date") ?? "").trim();
  const day = rawDate === "" ? londonToday() : readDay(rawDate);
  if (!day) return { ok: false, error: "That isn't a date." };
  const note = String(formData.get("note") ?? "").trim().slice(0, 200);
  const result = await savePayment({
    from_user: Number(formData.get("from")),
    to_user: Number(formData.get("to")),
    pence,
    on_date: day,
    note: note || null,
  });
  return result.ok ? { ok: true, message: "Recorded." } : result;
}

export async function removePayment(id: number): Promise<SpendResult> {
  const context = await requireKitchenRole("editor");
  if (!context.ok) return { ok: false, error: context.error };
  await deleteSettlement(context.kitchen.id, Number(id));
  revalidatePath("/spend");
  return { ok: true };
}

/**
 * A "probably due" suggestion, onto the shopping list.
 *
 * The source says why in the words the list will show, so whoever is in the
 * shop can tell a guess from a thing somebody asked for.
 */
export async function addDueToList(name: string, every: number): Promise<SpendResult> {
  const context = await requireKitchenRole("editor");
  if (!context.ok) return { ok: false, error: context.error };
  const days = Math.round(Number(every));
  const source = Number.isFinite(days) && days > 0 ? `Usually bought every ${days} days` : "Usually bought";
  const added = await addListLine(context.kitchen.id, context.user.id, String(name), source);
  if (added) record("shopping.add", context.user.id, "/list");
  revalidatePath("/spend");
  revalidatePath("/list");
  return added ? { ok: true } : { ok: true, message: "Already on the list." };
}
