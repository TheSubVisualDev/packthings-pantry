import { getDb } from "./db";

/**
 * The shopping list.
 *
 * Deliberately free text with an optional amount. Half of what goes on a
 * shopping list is "bread" - forcing a quantity and a unit on every line would
 * make the quick case the annoying one. `item_id` links to stock when the line
 * came from something the pantry already knows about, which is what lets
 * scanning tick it off.
 */

export interface ShoppingLine {
  id: number;
  item_id: number | null;
  item_name: string;
  quantity: number | null;
  unit: string | null;
  bought_at: string | null;
  /**
   * Where this gets bought, taken from the stock row it links to.
   *
   * Null for a free-text line, or for stock nobody has said a shop for - which
   * is most of it, and is why the ungrouped case has to look deliberate.
   */
  shop: string | null;
  added_by_handle: string | null;
}

export async function getList(kitchenId: number): Promise<ShoppingLine[]> {
  const result = await getDb().execute({
    sql: `SELECT s.id, s.item_id, s.item_name, s.quantity, s.unit, s.bought_at,
                 u.handle AS added_by_handle, i.shop
          FROM shopping_list s
          LEFT JOIN users u ON u.id = s.added_by
          LEFT JOIN items i ON i.id = s.item_id
          WHERE s.kitchen_id = ?
          -- Shop first, so one trip is one run down the page. NULLS LAST keeps
          -- the unassigned lines together at the end rather than at the top,
          -- where they would read as the most important group.
          ORDER BY (s.bought_at IS NOT NULL), i.shop IS NULL, i.shop COLLATE NOCASE,
                   s.created_at, s.id`,
    args: [kitchenId],
  });
  return result.rows as unknown as ShoppingLine[];
}

export async function addLine(
  kitchenId: number,
  userId: number,
  line: { name: string; quantity: number | null; unit: string | null; itemId?: number | null },
): Promise<void> {
  await getDb().execute({
    sql: `INSERT INTO shopping_list (kitchen_id, item_id, item_name, quantity, unit, added_by)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [kitchenId, line.itemId ?? null, line.name, line.quantity, line.unit, userId],
  });
}

/** Ticking is a toggle, because the commonest correction is an accidental tap. */
export async function setBought(
  kitchenId: number,
  lineId: number,
  bought: boolean,
): Promise<void> {
  await getDb().execute({
    sql: `UPDATE shopping_list SET bought_at = ${bought ? "CURRENT_TIMESTAMP" : "NULL"}
          WHERE id = ? AND kitchen_id = ?`,
    args: [lineId, kitchenId],
  });
}

export async function removeLine(kitchenId: number, lineId: number): Promise<void> {
  await getDb().execute({
    sql: "DELETE FROM shopping_list WHERE id = ? AND kitchen_id = ?",
    args: [lineId, kitchenId],
  });
}

export async function clearBought(kitchenId: number): Promise<number> {
  const result = await getDb().execute({
    sql: "DELETE FROM shopping_list WHERE kitchen_id = ? AND bought_at IS NOT NULL",
    args: [kitchenId],
  });
  return result.rowsAffected;
}

/** Names already on the list, so nothing gets added twice in one go. */
export async function pendingNames(kitchenId: number): Promise<Set<string>> {
  const result = await getDb().execute({
    sql: "SELECT item_name FROM shopping_list WHERE kitchen_id = ? AND bought_at IS NULL",
    args: [kitchenId],
  });
  return new Set(
    (result.rows as unknown as { item_name: string }[]).map((row) =>
      row.item_name.toLowerCase(),
    ),
  );
}

export interface RestockSuggestion {
  item_id: number;
  name: string;
  shop: string | null;
  /** Whole containers to buy: the target, less what is already here. */
  short: number;
  pack_size: number | null;
  pack_unit: string | null;
  canonical_unit: string;
}

/**
 * Things below the number of containers you said to keep.
 *
 * A part-used open container counts as one you have - nobody buys a replacement
 * bottle because the one in the door is half empty - so the sum is sealed, plus
 * one if anything is open, against restock_to.
 *
 * Anything already on the list is excluded by name rather than by item_id,
 * because a line typed by hand as "olive oil" is the same errand as the one the
 * pantry would add, and suggesting it again is how a list grows duplicates.
 */
export async function getRestockSuggestions(
  kitchenId: number,
): Promise<RestockSuggestion[]> {
  const result = await getDb().execute({
    sql: `SELECT i.id AS item_id, i.name, i.shop, i.pack_size, i.pack_unit,
                 i.canonical_unit,
                 i.restock_to - (i.sealed_count + (CASE WHEN i.quantity > 0 THEN 1 ELSE 0 END)) AS short
          FROM items i
          WHERE i.kitchen_id = ?
            AND i.restock_to IS NOT NULL
            AND i.unspecified = 0
            AND short > 0
            AND NOT EXISTS (
              SELECT 1 FROM shopping_list s
              WHERE s.kitchen_id = i.kitchen_id
                AND s.bought_at IS NULL
                AND LOWER(s.item_name) = LOWER(i.name)
            )
          ORDER BY short DESC, i.shop IS NULL, i.shop COLLATE NOCASE, i.name COLLATE NOCASE`,
    args: [kitchenId],
  });
  return result.rows as unknown as RestockSuggestion[];
}
