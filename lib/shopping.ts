import { getDb, plainRows } from "./db";
import { dimensionOf, scaleQuantity, toCanonical } from "./units";
import type { RecipeIngredient } from "./types";

/**
 * The shopping list.
 *
 * Deliberately free text with an optional amount. Half of what goes on a
 * shopping list is "bread" - forcing a quantity and a unit on every line would
 * make the quick case the annoying one.
 *
 * It used to know about the shelves: lines linked to stock rows, grouped by
 * the shop each row was bought at, and a "running low" panel offered whatever
 * had fallen below a target. v2 removed stock tracking on 18 Oct 2026 - see
 * docs/ROADMAP-V2.md - so a line is just a line. What replaces "running low"
 * is the receipts: how often something gets bought says when it is probably
 * due, which is a later milestone.
 */

export interface ShoppingLine {
  id: number;
  item_name: string;
  quantity: number | null;
  unit: string | null;
  bought_at: string | null;
  /**
   * Why it is on the list: the recipe it was shopped for.
   *
   * Null for a line somebody typed. The list shows it as a muted chip - never
   * in the destructive colour, because needing to buy something is not a
   * fault.
   */
  source: string | null;
  added_by_handle: string | null;
}

/**
 * Whose list this is.
 *
 * A kitchen's, or one person's. The second exists because a tester asked for
 * it and /kitchens already half agreed: an account without a kitchen is a
 * normal state there. Writing down what to buy needs no kitchen, only a pen.
 * Since v2 stopped tracking stock the two kinds are the same list with a
 * different owner; the kitchen's is simply shared.
 *
 * One type rather than an optional second argument, so every query is forced
 * to say which it means and none of them can default to the wrong one.
 */
export type ListScope = { kitchen: number } | { owner: number };

/** The WHERE fragment and its argument, so the scope is written down once. */
function scoped(scope: ListScope): { sql: string; arg: number } {
  return "kitchen" in scope
    ? { sql: "s.kitchen_id = ?", arg: scope.kitchen }
    : { sql: "s.owner_id = ?", arg: scope.owner };
}

export async function getList(scope: ListScope): Promise<ShoppingLine[]> {
  const where = scoped(scope);

  const result = await getDb().execute({
    sql: `SELECT s.id, s.item_name, s.quantity, s.unit, s.bought_at,
                 s.source, u.handle AS added_by_handle
          FROM shopping_list s
          LEFT JOIN users u ON u.id = s.added_by
          WHERE ${where.sql}
          -- Still to buy first, then in the order they were written down,
          -- which is roughly the order somebody thought of them.
          ORDER BY (s.bought_at IS NOT NULL), s.created_at, s.id`,
    args: [where.arg],
  });
  // Plain objects: the list is a client component. See plainRows in lib/db.ts.
  return plainRows<ShoppingLine>(result);
}

/** Returns the new line id, which is what lets a caller take it off again. */
export async function addLine(
  scope: ListScope,
  userId: number,
  line: {
    name: string;
    quantity: number | null;
    unit: string | null;
    /**
     * Why it is on the list, in the words the screen should say: the recipe
     * it was shopped for. Null for a line somebody typed, because "you typed
     * it" is not a fact worth a chip.
     */
    source?: string | null;
  },
): Promise<number> {
  const result = await getDb().execute({
    // item_id linked a line to a stock row. There are none in v2, so it is
    // left out and stays NULL until the schema retires the column.
    sql: `INSERT INTO shopping_list (kitchen_id, owner_id, item_name, quantity, unit, added_by, source)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      "kitchen" in scope ? scope.kitchen : null,
      "kitchen" in scope ? null : scope.owner,
      line.name,
      line.quantity,
      line.unit,
      userId,
      line.source ?? null,
    ],
  });
  return Number(result.lastInsertRowid);
}

/** Ticking is a toggle, because the commonest correction is an accidental tap. */
export async function setBought(
  scope: ListScope,
  lineId: number,
  bought: boolean,
): Promise<void> {
  const where = scoped(scope);
  await getDb().execute({
    // The scope stays in the WHERE clause, not just the id: it is what stops
    // a guessed line id reaching into somebody else's list.
    sql: `UPDATE shopping_list AS s SET bought_at = ${bought ? "CURRENT_TIMESTAMP" : "NULL"}
          WHERE s.id = ? AND ${where.sql}`,
    args: [lineId, where.arg],
  });
}

/**
 * The checkout, as one button: ticks the lines that were on screen, by id.
 *
 * Ticks rather than deletes, so the list keeps what was bought until somebody
 * clears it - which is what makes "in the basket" a state you can leave and
 * come back to. The scope stays in the WHERE clause, so an id from anybody
 * else's list ticks nothing.
 */
export async function tickLines(scope: ListScope, lineIds: number[]): Promise<number> {
  if (lineIds.length === 0) return 0;
  const where = scoped(scope);
  const result = await getDb().execute({
    sql: `UPDATE shopping_list AS s SET bought_at = CURRENT_TIMESTAMP
          WHERE ${where.sql} AND s.bought_at IS NULL
            AND s.id IN (${lineIds.map(() => "?").join(", ")})`,
    args: [where.arg, ...lineIds],
  });
  return result.rowsAffected;
}

export async function removeLine(scope: ListScope, lineId: number): Promise<void> {
  const where = scoped(scope);
  await getDb().execute({
    sql: `DELETE FROM shopping_list AS s WHERE s.id = ? AND ${where.sql}`,
    args: [lineId, where.arg],
  });
}

export async function clearBought(scope: ListScope): Promise<number> {
  const where = scoped(scope);
  const result = await getDb().execute({
    sql: `DELETE FROM shopping_list AS s
          WHERE ${where.sql} AND s.bought_at IS NOT NULL`,
    args: [where.arg],
  });
  return result.rowsAffected;
}

/** Names already on the list, so nothing gets added twice in one go. */
export async function pendingNames(scope: ListScope): Promise<Set<string>> {
  const where = scoped(scope);
  const result = await getDb().execute({
    sql: `SELECT s.item_name FROM shopping_list AS s
          WHERE ${where.sql} AND s.bought_at IS NULL`,
    args: [where.arg],
  });
  return new Set(
    (result.rows as unknown as { item_name: string }[]).map((row) =>
      row.item_name.toLowerCase(),
    ),
  );
}

/** One line a recipe would put on the list. */
export interface ShortfallLine {
  /** The recipe line it came from, which is what a checklist ticks. */
  ingredientId: number;
  name: string;
  quantity: number | null;
  unit: string | null;
}

export interface ShortfallResult {
  wanted: ShortfallLine[];
  /** How many of its lines were already waiting to be bought. */
  alreadyListed: number;
}

/**
 * What one recipe would need buying.
 *
 * With stock tracked, this compared each line against the shelves and listed
 * the difference. v2 does not know what is in the cupboard and does not ask,
 * so the honest answer is every line - and the person, who does know, unticks
 * what they already have before anything is written. The screens that call
 * this start every line ticked for that reason.
 *
 * Still one function, used by the recipe page and by the week planner's Shop
 * for it, because AGENTS.md counts the bugs that came from a second copy of
 * "what is this recipe short of".
 *
 * Two kinds of line are never listed:
 *
 * - **Unmeasured** ("salt, to taste", unit `some`). Asked of toCanonical, the
 *   one place that rule is written, rather than by comparing the unit here.
 *   With no shelves to say you have some, listing it would put salt on the
 *   list for every recipe for ever - the bug check:amounts exists for.
 * - **Optional**, which is a recipe saying you can do without.
 *
 * Pure, and takes the names already spoken for rather than fetching them:
 * shopping for a week asks about several recipes in a row, and a name listed
 * for Monday must not be listed again for Thursday.
 */
export function recipeShortfall(
  recipe: {
    base_servings: number;
    ingredients: Pick<
      RecipeIngredient,
      "id" | "item_name" | "quantity" | "unit" | "optional"
    >[];
  },
  servings: number,
  /**
   * Lowercased names already spoken for, so nothing is listed twice. Mutated:
   * anything this returns is added, so a second call for another day of the
   * same week does not list it again.
   */
  already: Set<string>,
): ShortfallResult {
  const wanted: ShortfallLine[] = [];
  /**
   * Lines this recipe wanted that were already waiting to be bought.
   *
   * Reported rather than inferred by the caller. "Nothing to add" means two
   * different things - it is all listed already, or the recipe only asks for
   * seasoning - and saying the wrong one is a claim somebody acts on in a shop.
   */
  let alreadyListed = 0;

  for (const line of recipe.ingredients) {
    if (line.optional === 1) continue;

    const conversion = toCanonical(1, line.unit, dimensionOf(line.unit) ?? "mass");
    if (!conversion.ok && conversion.reason === "unmeasured") continue;

    const key = line.item_name.toLowerCase();
    // Already waiting to be bought, or already added for an earlier day of
    // this same week. Left alone rather than topped up: the amount on the list
    // is one a person may have already adjusted.
    if (already.has(key)) {
      alreadyListed += 1;
      continue;
    }

    wanted.push({
      ingredientId: line.id,
      name: line.item_name,
      quantity: scaleQuantity(line.quantity, recipe.base_servings, servings),
      unit: line.unit,
    });
    already.add(key);
  }

  return { wanted, alreadyListed };
}
