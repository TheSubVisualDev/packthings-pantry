"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { PACK_SQL } from "@/lib/containers";
import { requireKitchenRole } from "@/lib/session";
import { pin, unpin } from "@/lib/trip";

export interface TripResult {
  ok: boolean;
  error?: string;
}

/**
 * Says what the kitchen is shopping for.
 *
 * Pinning is the moment a recipe stops being an idea and becomes the trip:
 * the shopping list is for it, the shop screen knows its name, and coming home
 * offers to cook it. One recipe at a time - pinning another replaces it.
 */
export async function pinTrip(recipeId: number): Promise<TripResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };
  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    return { ok: false, error: "Unknown recipe" };
  }

  await pin(access.kitchen.id, recipeId, access.user.id);
  revalidatePath("/pantry");
  revalidatePath("/pantry/list");
  revalidatePath("/tonight");
  return { ok: true };
}

export async function unpinTrip(): Promise<TripResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  await unpin(access.kitchen.id);
  revalidatePath("/pantry");
  revalidatePath("/pantry/list");
  revalidatePath("/tonight");
  return { ok: true };
}

/**
 * The checkout, as one button.
 *
 * Ticking eleven things off at the till is eleven taps in a queue with a
 * basket in one hand. The other way through a checkout is the receipt, which
 * does this and the restocking at once - this is for the shop that gave you a
 * paper one, or none.
 *
 * It ticks rather than deletes: the list keeps what was bought until somebody
 * clears it, which is what makes "in the basket" a state you can leave and
 * come back to.
 */
export async function gotEverything(): Promise<TripResult & { ticked?: number }> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  const result = await getDb().execute({
    sql: `UPDATE shopping_list SET bought_at = CURRENT_TIMESTAMP
          WHERE kitchen_id = ? AND bought_at IS NULL`,
    args: [access.kitchen.id],
  });

  revalidatePath("/pantry/list");
  revalidatePath("/pantry");
  return { ok: true, ticked: result.rowsAffected };
}

export interface PutAwayResult extends TripResult {
  /** Items a pack went onto, by name. */
  stocked?: string[];
  /** Lines that could not become stock, and why they are still on the list. */
  left?: string[];
}

/**
 * The walk from the front door to the cupboard.
 *
 * Ticking something off in a shop says you are holding it; it says nothing
 * about the shelf. Until now the only thing that closed that gap was scanning
 * the receipt, so a trip paid for in cash ended with a list full of ticks and
 * a pantry that still thought it was empty - and the "ready to cook" moment
 * this phase is built around could never arrive.
 *
 * A pack per line, because that is what a shopping line means: "Whole milk"
 * on a list is a bottle of the size you buy, not 1136ml of loose milk. Lines
 * with no stock row to point at, and items nobody has said a pack size for,
 * stay on the list and say so - putting away a thing the pantry cannot
 * describe would be inventing an amount.
 */
export async function putAwayBought(): Promise<PutAwayResult> {
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  const db = getDb();
  const bought = await db.execute({
    sql: `SELECT s.id, s.item_id, s.item_name, s.quantity, s.unit,
                 i.name AS stock_name, i.pack_size
          FROM shopping_list s
          LEFT JOIN items i ON i.id = s.item_id AND i.kitchen_id = s.kitchen_id
          WHERE s.kitchen_id = ? AND s.bought_at IS NOT NULL`,
    args: [access.kitchen.id],
  });

  const lines = bought.rows as unknown as {
    id: number;
    item_id: number | null;
    item_name: string;
    quantity: number | null;
    unit: string | null;
    stock_name: string | null;
    pack_size: number | null;
  }[];
  if (lines.length === 0) return { ok: false, error: "Nothing in the basket." };

  const stocked: string[] = [];
  const left: string[] = [];

  for (const line of lines) {
    if (line.item_id === null || line.stock_name === null) {
      left.push(`${line.item_name} — not a thing on your shelves yet`);
      continue;
    }
    if (line.pack_size === null) {
      left.push(`${line.stock_name} — no pack size, so no amount to add`);
      continue;
    }

    /**
     * How many packs. A line that says "2 packs" means two; anything else
     * means one, because "400g spinach" on a list is a bag of spinach.
     */
    const packs =
      line.unit === "pack" && line.quantity !== null && line.quantity > 0
        ? Math.min(20, Math.round(line.quantity))
        : 1;

    await db.execute({
      // PACK_SQL, because buying puts a sealed container on the shelf - it
      // does not pour anything into the one that is already open.
      sql: PACK_SQL,
      args: [packs, line.item_id, access.kitchen.id],
    });
    stocked.push(line.stock_name);

    // Off the list once it is on the shelf. The ones that could not be put
    // away stay, which is what stops this quietly losing them.
    await db.execute({
      sql: "DELETE FROM shopping_list WHERE id = ? AND kitchen_id = ?",
      args: [line.id, access.kitchen.id],
    });
  }

  revalidatePath("/pantry");
  revalidatePath("/pantry/list");
  return { ok: true, stocked, left };
}
