"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { isLocation } from "@/lib/locations";
import { isBarcode } from "@/lib/off";
import { CANONICAL_FOR, dimensionOf, toCanonical } from "@/lib/units";

export interface AddItemState {
  error?: string;
}

/**
 * Creates a stock item, converting the typed quantity into the dimension's
 * canonical unit on the way in.
 *
 * Dimension isn't asked for: it follows from the unit, so there's no way to
 * submit "kg" against a volume item. Stock is stored canonically so cook-time
 * decrements never have to guess what a row's numbers mean.
 */
export async function addItem(
  _previous: AddItemState,
  formData: FormData,
): Promise<AddItemState> {
  const name = String(formData.get("name") ?? "").trim();
  const unit = String(formData.get("unit") ?? "").trim().toLowerCase();
  const quantityRaw = String(formData.get("quantity") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const expiry = String(formData.get("expiry_date") ?? "").trim();
  const barcode = String(formData.get("barcode") ?? "").trim();

  if (!name) return { error: "Give it a name." };
  if (name.length > 80) return { error: "That name is too long." };

  const quantity = Number(quantityRaw);
  if (!Number.isFinite(quantity) || quantity < 0) {
    return { error: "Quantity has to be a number, zero or more." };
  }

  const dimension = dimensionOf(unit);
  if (!dimension) return { error: `"${unit}" isn't a unit I know.` };

  const converted = toCanonical(quantity, unit, dimension);
  if (!converted.ok) return { error: "That quantity couldn't be converted." };

  // An empty date input posts "", which would otherwise be stored as a date.
  const expiryDate = /^\d{4}-\d{2}-\d{2}$/.test(expiry) ? expiry : null;

  let itemId: number;

  try {
    const inserted = await getDb().execute({
      sql: `INSERT INTO items (name, quantity, canonical_unit, dimension, category, location, expiry_date)
            VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      args: [
        name,
        converted.quantity,
        CANONICAL_FOR[dimension],
        dimension,
        category || null,
        isLocation(location) ? location : null,
        expiryDate,
      ],
    });
    itemId = (inserted.rows[0] as unknown as { id: number }).id;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    // items.name is UNIQUE - adding more of something you have is an adjust.
    if (message.includes("UNIQUE")) {
      return { error: `"${name}" is already in stock. Use Quick adjust instead.` };
    }
    return { error: message || "Couldn't add that item." };
  }

  // Arrived from a scan: remember which item that barcode turned out to mean,
  // so the next scan of it recognises the product instead of asking again.
  if (isBarcode(barcode)) {
    await getDb().execute({
      sql: `INSERT INTO products (barcode, item_id, name, pack_size, pack_unit, seen_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(barcode) DO UPDATE SET
              item_id = excluded.item_id,
              pack_size = excluded.pack_size,
              pack_unit = excluded.pack_unit,
              seen_at = CURRENT_TIMESTAMP`,
      args: [barcode, itemId, name, converted.quantity, CANONICAL_FOR[dimension]],
    });
  }

  revalidatePath("/pantry");
  revalidatePath("/recipes");
  redirect("/pantry");
}

export interface AdjustResult {
  ok: boolean;
  error?: string;
  quantity?: number;
}

/**
 * Moves one item's stock by a delta in its canonical unit.
 *
 * The arithmetic happens in SQL rather than read-then-write: Claude Code is a
 * second writer on this database, so a quantity read into JS and written back
 * would discard anything that landed in between. Clamped at zero, since
 * negative stock isn't a thing.
 */
export async function adjustItem(
  itemId: number,
  delta: number,
): Promise<AdjustResult> {
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return { ok: false, error: "Unknown item" };
  }
  if (!Number.isFinite(delta) || delta === 0) {
    return { ok: false, error: "Nothing to change" };
  }

  const result = await getDb().execute({
    sql: `UPDATE items SET quantity = MAX(0, quantity + ?), updated_at = CURRENT_TIMESTAMP
          WHERE id = ? RETURNING quantity`,
    args: [delta, itemId],
  });

  const row = result.rows[0] as unknown as { quantity: number } | undefined;
  if (!row) return { ok: false, error: "That item is gone" };

  revalidatePath("/pantry");
  revalidatePath("/recipes");
  return { ok: true, quantity: row.quantity };
}
