"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { cleanProductName, rankItems, STRONG_MATCH } from "@/lib/match";
import { isBarcode, lookupOpenFoodFacts, type PackSize } from "@/lib/off";
import { getItems } from "@/lib/queries";
import { getTags, getTagsByItem } from "@/lib/tags";
import { requireKitchenRole } from "@/lib/session";
import { toCanonical } from "@/lib/units";
import type { Item } from "@/lib/types";

export interface Suggestion {
  id: number;
  name: string;
  quantity: number;
  unit: string;
  score: number;
  /** At or above the strong threshold, so worth preselecting. */
  confident: boolean;
}

/** Everything the add form should already know by the time you reach it. */
export interface ScanPrefill {
  name: string;
  quantity: string;
  unit: string;
  /** Comma separated, which is what the add form's tag field expects. */
  tags: string;
  location: string;
}

export interface ScanMatch {
  barcode: string;
  name: string | null;
  brand: string | null;
  /** What Open Food Facts calls it, general to specific. */
  categories: string[];
  pack: PackSize | null;
  /** The item this barcode was previously linked to, if any. */
  linked: { id: number; name: string; quantity: number; unit: string } | null;
  /** Whether anything is known about it at all. */
  known: boolean;
  /** Existing rows this product probably belongs on, best first. */
  suggestions: Suggestion[];
  prefill: ScanPrefill;
}

export interface ScanResult {
  ok: boolean;
  error?: string;
  match?: ScanMatch;
}

/**
 * Resolves a scanned barcode: what this kitchen already knows first, Open Food
 * Facts second.
 *
 * Product links are per kitchen on purpose. The same barcode can mean the
 * generic pasta row in one house and its own line in another, and that decision
 * belongs to whoever made it.
 *
 * A previously linked barcode short-circuits the network call - once someone
 * has said which item a product is, that answer is better than anything the
 * catalogue can offer.
 */
export async function lookupBarcode(barcode: string): Promise<ScanResult> {
  // Looking one up changes nothing, so a viewer may scan - it's how they see
  // whether a kitchen already has the thing in their hand.
  const access = await requireKitchenRole("viewer");
  if (!access.ok) return { ok: false, error: access.error };

  const code = barcode.trim();
  if (!isBarcode(code)) {
    return { ok: false, error: `"${code}" doesn't look like a barcode.` };
  }

  const stored = await getDb().execute({
    sql: `SELECT p.name, p.brand, p.pack_size, p.pack_unit, p.item_id,
                 i.name AS item_name, i.quantity AS item_quantity, i.canonical_unit
          FROM products p LEFT JOIN items i ON i.id = p.item_id
          WHERE p.barcode = ? AND p.kitchen_id = ?`,
    args: [code, access.kitchen.id],
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
        categories: [],
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
        // A linked barcode has already had its question answered.
        suggestions: [],
        prefill: { name: "", quantity: "", unit: "", tags: "", location: "" },
      },
    };
  }

  const [product, items, kitchenTags, tagsByItem] = await Promise.all([
    lookupOpenFoodFacts(code),
    getItems(access.kitchen.id),
    getTags(access.kitchen.id),
    getTagsByItem(access.kitchen.id),
  ]);

  const name = product?.name ?? row?.name ?? null;
  const brand = product?.brand ?? row?.brand ?? null;
  const pack = product?.pack ?? null;

  const ranked = rankItems(name, brand, pack?.unit ?? null, items);
  const best = ranked[0]?.item;

  /**
   * Tags to arrive at the add form with.
   *
   * The nearest existing item first: this kitchen has already decided how it
   * files things like this, and that decision beats a catalogue's. Then any
   * Open Food Facts category, reusing the kitchen's own spelling when it has
   * one - so a scan joins the "Sauces" that exists rather than starting a
   * second "sauces" beside it.
   */
  const kitchenSpelling = new Map(
    kitchenTags.map((tag) => [tag.name.toLowerCase(), tag.name]),
  );
  const suggestedTags = [
    ...new Set([
      ...(best ? (tagsByItem.get(best.id) ?? []).map((tag) => tag.name) : []),
      ...(product?.categories ?? []).map(
        (name) => kitchenSpelling.get(name.toLowerCase()) ?? name,
      ),
    ]),
  ].slice(0, 4);

  return {
    ok: true,
    match: {
      barcode: code,
      name,
      brand,
      categories: product?.categories ?? [],
      pack,
      linked: null,
      known: Boolean(product) || Boolean(row),
      suggestions: ranked.slice(0, 4).map(({ item, score }) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.canonical_unit,
        score,
        confident: score >= STRONG_MATCH,
      })),
      prefill: {
        name: cleanProductName(name, brand),
        quantity: pack ? String(pack.quantity) : "",
        // No pack size on record, so fall back to how the nearest existing
        // item is measured rather than defaulting everything to grams.
        unit: pack?.unit ?? best?.canonical_unit ?? "",
        // The pantry's own words for this beat the catalogue's, which runs to
        // things like "Confectionary based spreads".
        tags: suggestedTags.join(", "),
        // Nothing in a barcode says where it lives; the closest neighbour is
        // the only signal there is.
        location: best?.location ?? "",
      },
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
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  const code = barcode.trim();
  if (!isBarcode(code)) return { ok: false, error: "Bad barcode" };
  if (!Number.isInteger(itemId) || itemId <= 0) return { ok: false, error: "Unknown item" };

  const db = getDb();

  const itemResult = await db.execute({
    sql: "SELECT * FROM items WHERE id = ? AND kitchen_id = ?",
    args: [itemId, access.kitchen.id],
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
    sql: `INSERT INTO products (barcode, kitchen_id, item_id, name, brand, pack_size, pack_unit, seen_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(barcode) DO UPDATE SET
            item_id = excluded.item_id,
            name = COALESCE(excluded.name, products.name),
            brand = COALESCE(excluded.brand, products.brand),
            pack_size = COALESCE(excluded.pack_size, products.pack_size),
            pack_unit = COALESCE(excluded.pack_unit, products.pack_unit),
            seen_at = CURRENT_TIMESTAMP`,
    args: [
      code,
      access.kitchen.id,
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
            WHERE id = ? AND kitchen_id = ? RETURNING quantity`,
      args: [packCanonical, itemId, access.kitchen.id],
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
  const access = await requireKitchenRole("editor");
  if (!access.ok) return { ok: false, error: access.error };

  const code = barcode.trim();
  if (!isBarcode(code)) return { ok: false, error: "Bad barcode" };

  const result = await getDb().execute({
    sql: `SELECT p.item_id, p.pack_size, i.canonical_unit
          FROM products p JOIN items i ON i.id = p.item_id
          WHERE p.barcode = ? AND p.kitchen_id = ?`,
    args: [code, access.kitchen.id],
  });

  const row = result.rows[0] as unknown as
    | { item_id: number; pack_size: number | null; canonical_unit: string }
    | undefined;

  if (!row) return { ok: false, error: "That barcode isn't linked to anything yet." };
  if (!row.pack_size) return { ok: false, error: "No pack size on record - use Quick adjust." };

  const updated = await getDb().execute({
    sql: `UPDATE items SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND kitchen_id = ? RETURNING quantity`,
    args: [row.pack_size, row.item_id, access.kitchen.id],
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
