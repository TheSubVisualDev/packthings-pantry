import { getDb, plainRows } from "./db";

/**
 * The product layer, surfaced at last.
 *
 * The pantry has always had three layers - a generic food, the row on your
 * shelf, and the barcoded product you actually bought - and only ever showed
 * the middle one. So "Baked beans" was one line in the stock list whether you
 * had bought Heinz once or four supermarkets' own brands over a year, and the
 * question everybody actually asks about baked beans had nowhere to live.
 *
 * A rating belongs to the barcode rather than to your row, because the tin is
 * the thing two households can compare. Your item is called whatever you call
 * it.
 */

export interface ProductForItem {
  barcode: string;
  name: string | null;
  brand: string | null;
  pack_size: number | null;
  pack_unit: string | null;
  kcal_100: number | null;
  /** When this kitchen last scanned it. */
  seen_at: string | null;
  /** What you gave it, out of five. Null when you have not said. */
  yours: number | null;
  /** Everyone's average, to one decimal, and how many said so. */
  average: number | null;
  votes: number;
}

/**
 * Every product this kitchen has mapped onto one stock row, best-rated first.
 *
 * Ordered by rating rather than by recency because this list is an answer to
 * "which one should I buy" - the most recent tin is the one you are trying to
 * decide about, not the recommendation.
 */
export async function getProductsForItem(
  kitchenId: number | null,
  itemId: number,
  viewerId: number,
): Promise<ProductForItem[]> {
  if (kitchenId === null) return [];

  const result = await getDb().execute({
    sql: `SELECT kp.barcode, kp.seen_at,
                 p.name, p.brand, p.pack_size, p.pack_unit, p.kcal_100,
                 (SELECT rating FROM product_ratings
                   WHERE barcode = kp.barcode AND user_id = ?) AS yours,
                 (SELECT ROUND(AVG(rating), 1) FROM product_ratings
                   WHERE barcode = kp.barcode) AS average,
                 (SELECT COUNT(*) FROM product_ratings
                   WHERE barcode = kp.barcode) AS votes
          FROM kitchen_products kp
          LEFT JOIN products p ON p.barcode = kp.barcode
          WHERE kp.kitchen_id = ? AND kp.item_id = ?
          ORDER BY average DESC NULLS LAST, kp.seen_at DESC`,
    args: [viewerId, kitchenId, itemId],
  });

  return plainRows<ProductForItem>(result);
}

/** One person's verdict on one product. */
export async function rate(
  barcode: string,
  userId: number,
  rating: number,
  note: string | null,
): Promise<void> {
  await getDb().execute({
    sql: `INSERT INTO product_ratings (barcode, user_id, rating, note, rated_at)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(barcode, user_id) DO UPDATE SET
            rating = excluded.rating,
            note = COALESCE(excluded.note, product_ratings.note),
            rated_at = CURRENT_TIMESTAMP`,
    args: [barcode, userId, rating, note],
  });
}

/** Takes a rating back, which is different from giving it one star. */
export async function unrate(barcode: string, userId: number): Promise<void> {
  await getDb().execute({
    sql: "DELETE FROM product_ratings WHERE barcode = ? AND user_id = ?",
    args: [barcode, userId],
  });
}

export interface PaidPrice {
  pence: number;
  raw: string | null;
  seen_at: string;
}

/**
 * What this kitchen has paid for something, most recent first.
 *
 * Read off receipts, which is the only place the app ever meets a price. The
 * series matters more than the latest figure - "£1.35, £1.35, £1.89" is the
 * sentence people actually want - so this hands back the history and lets the
 * screen decide how much of it to show.
 */
export async function getPrices(
  kitchenId: number | null,
  itemId: number,
  limit = 6,
): Promise<PaidPrice[]> {
  if (kitchenId === null) return [];

  const result = await getDb().execute({
    sql: `SELECT pence, raw, seen_at FROM item_prices
          WHERE kitchen_id = ? AND item_id = ?
          ORDER BY seen_at DESC, id DESC
          LIMIT ?`,
    args: [kitchenId, itemId, limit],
  });
  return plainRows<PaidPrice>(result);
}

/**
 * A price per 100g or 100ml, which is the only way two pack sizes can be
 * compared. Null when the pantry does not know what one pack holds - a
 * number-per-100 worked out from a guessed pack size would be a made-up fact
 * with a decimal point in it.
 */
export function per100(pence: number, packSize: number | null, unit: string): number | null {
  if (packSize === null || packSize <= 0) return null;
  if (unit !== "g" && unit !== "ml") return null;
  return Math.round((pence / packSize) * 100);
}
