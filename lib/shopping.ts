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

/**
 * The list, optionally narrowed to one shop.
 *
 * Grouping and filtering ask different questions of the same data, so they use
 * different columns. A line is GROUPED under the shop you usually buy it from,
 * because that is where it belongs on a normal week. A line is KEPT by the
 * filter if that shop sells it at all - standing in Tesco you want everything
 * Tesco has, not only the things you usually buy there.
 *
 * Lines with no shop survive every filter. A free-text "kitchen roll", or stock
 * nobody has said a shop for, can be got here as much as anywhere, and hiding it
 * would mean walking out without it.
 */
export async function getList(
  kitchenId: number,
  shop?: string | null,
): Promise<ShoppingLine[]> {
  const filter = shop?.trim() || null;

  const result = await getDb().execute({
    sql: `SELECT s.id, s.item_id, s.item_name, s.quantity, s.unit, s.bought_at,
                 u.handle AS added_by_handle, ps.name AS shop
          FROM shopping_list s
          LEFT JOIN users u ON u.id = s.added_by
          LEFT JOIN items i ON i.id = s.item_id
          LEFT JOIN shops ps ON ps.id = i.preferred_shop_id
          WHERE s.kitchen_id = ?
            AND (
              ? IS NULL
              OR NOT EXISTS (SELECT 1 FROM item_shops isx WHERE isx.item_id = i.id)
              OR EXISTS (
                SELECT 1 FROM item_shops isx
                JOIN shops sh ON sh.id = isx.shop_id
                WHERE isx.item_id = i.id AND LOWER(sh.name) = LOWER(?)
              )
            )
          -- Shop first, so one trip is one run down the page. Unassigned lines
          -- go last rather than first, where they would read as the most
          -- important group.
          ORDER BY (s.bought_at IS NOT NULL), ps.name IS NULL, ps.name COLLATE NOCASE,
                   s.created_at, s.id`,
    args: [kitchenId, filter, filter],
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
  /** How much short of the target, in the item's own unit. */
  short: number;
  /** Whole packs that covers, rounded up. Null when it is not packaged. */
  packs: number | null;
  pack_size: number | null;
  pack_unit: string | null;
  canonical_unit: string;
}

/**
 * Things that have fallen below what you said to keep.
 *
 * The target is an amount of the thing, never a count of packaging: "keep 6
 * eggs", not "keep one box". Packs only come into it when buying, where the
 * shortfall is rounded UP to whole ones - you cannot buy two thirds of a box,
 * and rounding down would leave you short of the number you asked for.
 *
 * What is on hand is the real total, sealed packs plus what is in the open one.
 * An earlier version counted a part-used container as a whole one you have,
 * which reads fine for a bottle of soy sauce and badly for a box with two eggs
 * left in it. Comparing actual amounts makes the question disappear.
 *
 * Anything already on the list is excluded by name rather than by item_id: a
 * line typed by hand as "olive oil" is the same errand as the one the pantry
 * would add, and suggesting it again is how a list grows duplicates.
 */
export async function getRestockSuggestions(
  kitchenId: number,
): Promise<RestockSuggestion[]> {
  const result = await getDb().execute({
    sql: `SELECT i.id AS item_id, i.name, ps.name AS shop, i.pack_size, i.pack_unit,
                 i.canonical_unit,
                 i.restock_target
                   - (COALESCE(i.sealed_count, 0) * COALESCE(i.pack_size, 0) + i.quantity)
                   AS short
          FROM items i
          LEFT JOIN shops ps ON ps.id = i.preferred_shop_id
          WHERE i.kitchen_id = ?
            AND i.unspecified = 0
            AND i.restock_target IS NOT NULL
            AND short > 0
            AND NOT EXISTS (
              SELECT 1 FROM shopping_list s
              WHERE s.kitchen_id = i.kitchen_id
                AND s.bought_at IS NULL
                AND LOWER(s.item_name) = LOWER(i.name)
            )
          ORDER BY ps.name IS NULL, ps.name COLLATE NOCASE, i.name COLLATE NOCASE`,
    args: [kitchenId],
  });

  return (result.rows as unknown as Omit<RestockSuggestion, "packs">[]).map(
    (row) => ({
      ...row,
      // Rounded up, because half a box is not something a shop sells.
      packs:
        row.pack_size !== null && row.pack_size > 0
          ? Math.ceil(row.short / row.pack_size)
          : null,
    }),
  );
}
