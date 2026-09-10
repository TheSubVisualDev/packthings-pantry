"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { isBarcode, lookupOpenFoodFacts, type PackSize } from "@/lib/off";
import { toCanonical } from "@/lib/units";
import type { Item } from "@/lib/types";

export interface ScanMatch {
  barcode: string;
  name: string | null;
  brand: string | null;
  category: string | null;
  pack: PackSize | null;
  /** The item this barcode was previously linked to, if any. */
  linked: { id: number; name: string; quantity: number; unit: string } | null;
  /** Whether anything is known about it at all. */
  known: boolean;
}

export interface ScanResult {
  ok: boolean;
  error?: string;
  match?: ScanMatch;
}

/**
 * Resolves a scanned barcode: what we already know first, Open Food Facts
 * second.
 *
 * A previously linked barcode short-circuits the network call - once someone
 * has said which item a product is, that answer is better than anything the
 * catalogue can offer.
 */
export async function lookupBarcode(barcode: string): Promise<ScanResult> {
  const code = barcode.trim();
  if (!isBarcode(code)) {
    return { ok: false, error: `"${code}" doesn't look like a barcode.` };
  }

  const stored = await getDb().execute({
    sql: `SELECT p.name, p.brand, p.pack_size, p.pack_unit, p.item_id,
                 i.name AS item_name, i.quantity AS item_quantity, i.canonical_unit
          FROM products p LEFT JOIN items i ON i.id = p.item_id
          WHERE p.barcode = ?`,
    args: [code],
  });

  const row = stored.rows[0] as unknown as
    | {
        name: string | null;
        brand: string | null;
        pack_size: number | null;
        pack_unit: string | null;
        item_id: number | null;
        item_name: string | null;
        item_quantity: number | null;
        canonical_unit: string | null;
      }
    | undefined;

  if (row?.item_id && row.item_name) {
    return {
      ok: true,
      match: {
        barcode: code,
        name: row.name,
        brand: row.brand,
        category: null,
        pack:
          row.pack_size && row.pack_unit
            ? {
                quantity: row.pack_size,
                unit: row.pack_unit,
                dimension: row.pack_unit === "count" ? "count" : row.pack_unit === "ml" ? "volume" : "mass",
              }
            : null,
        linked: {
          id: row.item_id,
          name: row.item_name,
          quantity: row.item_quantity ?? 0,
          unit: row.canonical_unit ?? "",
        },
        known: true,
      },
    };
  }

  const product = await lookupOpenFoodFacts(code);

  return {
    ok: true,
    match: {
      barcode: code,
      name: product?.name ?? row?.name ?? null,
      brand: product?.brand ?? row?.brand ?? null,
      category: product?.category ?? null,
      pack: product?.pack ?? null,
      linked: null,
      known: Boolean(product) || Boolean(row),
    },
  };
}

/**
 * Ties a barcode to an item and, optionally, puts one pack into stock.
 *
 * This is the generic-versus-distinct call the plan says a machine can't make:
 * scanned linguine might belong on the generic "Pasta" row or deserve its own,
 * and only the person holding the packet knows which.
 */
export async function linkBarcode(
  barcode: string,
  itemId: number,
  product: { name: string | null; brand: string | null; pack: PackSize | null },
  addPack: boolean,
): Promise<{ ok: boolean; error?: string; quantity?: number }> {
  const code = barcode.trim();
  if (!isBarcode(code)) return { ok: false, error: "Bad barcode" };
  if (!Number.isInteger(itemId) || itemId <= 0) return { ok: false, error: "Unknown item" };

  const db = getDb();

  const itemResult = await db.execute({
    sql: "SELECT * FROM items WHERE id = ?",
    args: [itemId],
  });
  const item = itemResult.rows[0] as unknown as Item | undefined;
  if (!item) return { ok: false, error: "That item is gone" };

  // A pack size in a different dimension than the item is stored as a label
  // only - 500g against a millilitre row can't be added to stock.
  let packCanonical: number | null = null;
  if (product.pack) {
    const converted = toCanonical(product.pack.quantity, product.pack.unit, item.dimension);
    if (converted.ok) packCanonical = converted.quantity;
  }

  await db.execute({
    sql: `INSERT INTO products (barcode, item_id, name, brand, pack_size, pack_unit, seen_at)
          VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(barcode) DO UPDATE SET
            item_id = excluded.item_id,
            name = COALESCE(excluded.name, products.name),
            brand = COALESCE(excluded.brand, products.brand),
            pack_size = COALESCE(excluded.pack_size, products.pack_size),
            pack_unit = COALESCE(excluded.pack_unit, products.pack_unit),
            seen_at = CURRENT_TIMESTAMP`,
    args: [
      code,
      itemId,
      product.name,
      product.brand,
      packCanonical,
      packCanonical === null ? null : item.canonical_unit,
    ],
  });

  let quantity = item.quantity;

  if (addPack) {
    if (packCanonical === null) {
      return { ok: false, error: "Linked, but the pack size doesn't fit that item's unit." };
    }
    const updated = await db.execute({
      sql: `UPDATE items SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? RETURNING quantity`,
      args: [packCanonical, itemId],
    });
    quantity = (updated.rows[0] as unknown as { quantity: number }).quantity;
  }

  revalidatePath("/pantry");
  revalidatePath("/recipes");
  return { ok: true, quantity };
}

/** Adds one more pack of an already-linked barcode. The repeat-shop path. */
export async function restockBarcode(
  barcode: string,
): Promise<{ ok: boolean; error?: string; quantity?: number; added?: number; unit?: string }> {
  const code = barcode.trim();
  if (!isBarcode(code)) return { ok: false, error: "Bad barcode" };

  const result = await getDb().execute({
    sql: `SELECT p.item_id, p.pack_size, i.canonical_unit
          FROM products p JOIN items i ON i.id = p.item_id
          WHERE p.barcode = ?`,
    args: [code],
  });

  const row = result.rows[0] as unknown as
    | { item_id: number; pack_size: number | null; canonical_unit: string }
    | undefined;

  if (!row) return { ok: false, error: "That barcode isn't linked to anything yet." };
  if (!row.pack_size) return { ok: false, error: "No pack size on record - use Quick adjust." };

  const updated = await getDb().execute({
    sql: `UPDATE items SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? RETURNING quantity`,
    args: [row.pack_size, row.item_id],
  });

  revalidatePath("/pantry");
  revalidatePath("/recipes");
  return {
    ok: true,
    quantity: (updated.rows[0] as unknown as { quantity: number }).quantity,
    added: row.pack_size,
    unit: row.canonical_unit,
  };
}
