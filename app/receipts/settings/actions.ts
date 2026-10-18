"use server";

import { revalidatePath } from "next/cache";
import { requireKitchenRole } from "@/lib/session";
import { addCategory, renameCategory, removeCategory } from "@/lib/receipt-db";
import { deleteCard } from "@/lib/spend-db";

export interface SettingsResult {
  ok: boolean;
  error?: string;
}

/**
 * Every one of these is a public endpoint (AGENTS.md), so each asks for the
 * kitchen itself and hands it to a query that puts it in the WHERE. An id from
 * the form only ever narrows within that kitchen.
 */

export async function newCategory(name: string): Promise<SettingsResult> {
  const context = await requireKitchenRole("editor");
  if (!context.ok) return { ok: false, error: context.error };
  if (!name.trim()) return { ok: false, error: "Give it a name." };
  await addCategory(context.kitchen.id, name);
  revalidatePath("/receipts/settings");
  return { ok: true };
}

export async function saveCategoryName(id: number, name: string): Promise<SettingsResult> {
  const context = await requireKitchenRole("editor");
  if (!context.ok) return { ok: false, error: context.error };
  if (!name.trim()) return { ok: false, error: "A category needs a name." };
  try {
    await renameCategory(context.kitchen.id, Number(id), name);
  } catch {
    // The only way this fails in practice is the unique index on the name.
    return { ok: false, error: "There is already a category called that." };
  }
  revalidatePath("/receipts/settings");
  return { ok: true };
}

export async function dropCategory(id: number): Promise<SettingsResult> {
  const context = await requireKitchenRole("editor");
  if (!context.ok) return { ok: false, error: context.error };
  await removeCategory(context.kitchen.id, Number(id));
  revalidatePath("/receipts/settings");
  return { ok: true };
}

export async function forgetCard(last4: string): Promise<SettingsResult> {
  const context = await requireKitchenRole("editor");
  if (!context.ok) return { ok: false, error: context.error };
  await deleteCard(context.kitchen.id, String(last4));
  revalidatePath("/receipts/settings");
  return { ok: true };
}
