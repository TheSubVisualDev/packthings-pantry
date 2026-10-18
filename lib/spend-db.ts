import { getDb, plainRows } from "./db";

/**
 * The few queries /spend, /meals and receipt settings need that
 * lib/receipt-db.ts does not have.
 *
 * Same rule as there: the kitchen goes in every WHERE clause, so a guessed id
 * from another kitchen matches nothing rather than being refused by an `if`
 * somewhere upstream that a future caller forgets to write.
 */

export interface KnownCard {
  last4: string;
  user_id: number;
  name: string;
}

/** Whose card is whose, as learned from receipts somebody said who paid for. */
export async function getCards(kitchenId: number): Promise<KnownCard[]> {
  const result = await getDb().execute({
    sql: `SELECT c.last4, c.user_id, COALESCE(NULLIF(u.display_name, ''), u.handle) AS name
          FROM payment_cards c JOIN users u ON u.id = c.user_id
          WHERE c.kitchen_id = ?
          ORDER BY name COLLATE NOCASE, c.last4`,
    args: [kitchenId],
  });
  return plainRows<KnownCard>(result);
}

/**
 * Forgets a card. The receipts it was learned from keep their purchaser - it
 * only stops the next receipt with those digits being filled in for you.
 */
export async function deleteCard(kitchenId: number, last4: string): Promise<void> {
  await getDb().execute({
    sql: "DELETE FROM payment_cards WHERE kitchen_id = ? AND last4 = ?",
    args: [kitchenId, last4],
  });
}

/**
 * Names already waiting on the kitchen's list, lowercased.
 *
 * So a "probably due" suggestion that is already on the list is not offered
 * again: pressing Add twice and getting soy sauce twice is the kind of small
 * wrongness that teaches people to stop trusting a suggestion.
 */
export async function pendingListNames(kitchenId: number): Promise<Set<string>> {
  const result = await getDb().execute({
    sql: "SELECT LOWER(item_name) AS name FROM shopping_list WHERE kitchen_id = ? AND bought_at IS NULL",
    args: [kitchenId],
  });
  return new Set(result.rows.map((row) => String(row.name).trim()));
}

/**
 * Puts a line on the kitchen's shopping list, unless it is already there.
 *
 * A direct insert rather than lib/shopping.ts's addLine, which is being
 * reshaped for v2 as this is written and still carries v1's item_id. The
 * kitchen is the scope and owner_id stays null - the table's CHECK wants
 * exactly one of the two. The not-already-there test is in the same
 * statement, so two quick taps cannot both pass it.
 */
export async function addListLine(
  kitchenId: number,
  userId: number,
  name: string,
  source: string,
): Promise<boolean> {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!clean) return false;
  const result = await getDb().execute({
    sql: `INSERT INTO shopping_list (kitchen_id, owner_id, item_name, added_by, source)
          SELECT ?, NULL, ?, ?, ?
          WHERE NOT EXISTS (
            SELECT 1 FROM shopping_list
            WHERE kitchen_id = ? AND bought_at IS NULL AND LOWER(TRIM(item_name)) = LOWER(?)
          )`,
    args: [kitchenId, clean, userId, source, kitchenId, clean],
  });
  return result.rowsAffected > 0;
}

/**
 * A 'YYYY-MM-DD' that is a real day, or null.
 *
 * Round-tripped, not just pattern-matched, because "2026-02-31" passes the
 * pattern and would be stored as a day that does not exist - the same check
 * the planner makes.
 */
export function readDay(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10) === value ? value : null;
}
