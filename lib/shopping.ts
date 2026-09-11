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
  added_by_handle: string | null;
}

export async function getList(kitchenId: number): Promise<ShoppingLine[]> {
  const result = await getDb().execute({
    sql: `SELECT s.id, s.item_id, s.item_name, s.quantity, s.unit, s.bought_at,
                 u.handle AS added_by_handle
          FROM shopping_list s
          LEFT JOIN users u ON u.id = s.added_by
          WHERE s.kitchen_id = ?
          ORDER BY (s.bought_at IS NOT NULL), s.created_at, s.id`,
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
