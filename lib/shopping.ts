import { getDb, plainRows } from "./db";
import { resolveWithLinks } from "./cookbook";
import { totalOnHand } from "./containers";
import type { StockIndex } from "./pantry-match";
import { resolveAmount, scaleQuantity } from "./units";
import type { Item, RecipeIngredient } from "./types";

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
  /**
   * Why it is on the list: a recipe name, "running low", "ran out cooking".
   *
   * Null for a line somebody typed. The list shows it as a muted chip - never
   * in the destructive colour, because needing to buy something is not a
   * fault.
   */
  source: string | null;
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
/**
 * Whose list this is.
 *
 * A kitchen's, or one person's. The second exists because a tester asked for
 * it and /kitchens already half agreed: an account without a kitchen is a
 * normal state there, "you can follow people and write recipes without ever
 * tracking a tin of beans". Writing down what to buy is squarely in that
 * category - it needs no shelves, only a pen. What it does not get is
 * everything that compares the list to shelves: restock suggestions, shop
 * grouping, and the trip.
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

export async function getList(
  scope: ListScope,
  shop?: string | null,
): Promise<ShoppingLine[]> {
  const filter = shop?.trim() || null;
  const where = scoped(scope);

  const result = await getDb().execute({
    sql: `SELECT s.id, s.item_id, s.item_name, s.quantity, s.unit, s.bought_at,
                 s.source, u.handle AS added_by_handle, ps.name AS shop
          FROM shopping_list s
          LEFT JOIN users u ON u.id = s.added_by
          LEFT JOIN items i ON i.id = s.item_id
          LEFT JOIN shops ps ON ps.id = i.preferred_shop_id
          WHERE ${where.sql}
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
    args: [where.arg, filter, filter],
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
    itemId?: number | null;
    /**
     * Why it is on the list, in the words the screen should say.
     *
     * "Pad thai", "running low", "ran out cooking Chana masala". Null for a
     * line somebody typed, because "you typed it" is not a fact worth a chip.
     */
    source?: string | null;
  },
): Promise<number> {
  const result = await getDb().execute({
    sql: `INSERT INTO shopping_list (kitchen_id, owner_id, item_id, item_name, quantity, unit, added_by, source)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      "kitchen" in scope ? scope.kitchen : null,
      "kitchen" in scope ? null : scope.owner,
      line.itemId ?? null,
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

/**
 * What one recipe would need buying, given these shelves.
 *
 * Lifted out of the "add what's missing" button so the week planner can ask
 * the same question about seven dinners at once. It was a hundred lines inside
 * a server action, and a second copy of "what does this recipe cost me" is a
 * second place for the container rule to be got wrong - which AGENTS.md keeps
 * a count of, and the count is five.
 *
 * Pure, and takes the shelves rather than fetching them: shopping for a week
 * means asking about several recipes against one snapshot of stock, and
 * re-reading the cupboard between each one would let a line be added twice.
 */
/** One line to put on the list, as the shortfall worked it out. */
export interface ShortfallLine {
  name: string;
  quantity: number | null;
  unit: string | null;
  itemId?: number;
}

export interface ShortfallResult {
  wanted: ShortfallLine[];
  /** How many of its lines were already waiting to be bought. */
  alreadyListed: number;
}

export function recipeShortfall(
  recipe: {
    name: string;
    base_servings: number;
    ingredients: RecipeIngredient[];
  },
  servings: number,
  shelves: {
    index: StockIndex;
    byId: Map<number, Item>;
    links: Map<number, number | null>;
  },
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
   * Reported rather than inferred by the caller. "Nothing added" means two
   * different things - you have everything, or it is already on the list - and
   * telling somebody they have everything when it is merely already listed is
   * a lie they would act on in a shop.
   */
  let alreadyListed = 0;

  for (const line of recipe.ingredients) {
    if (line.optional === 1) continue;
    // Already waiting to be bought, or already added for an earlier day of
    // this same week. Left alone rather than topped up: the amount on the list
    // is one a person may have already adjusted.
    if (already.has(line.item_name.toLowerCase())) {
      alreadyListed += 1;
      continue;
    }

    const { item } = resolveWithLinks(line, shelves.links, shelves.index, shelves.byId);
    const need = scaleQuantity(line.quantity, recipe.base_servings, servings);

    // Nothing in stock under that name: buy it, without pretending to know how
    // much of it the shelf already has.
    if (!item) {
      wanted.push({ name: line.item_name, quantity: need, unit: line.unit });
      already.add(line.item_name.toLowerCase());
      continue;
    }

    const converted = resolveAmount(
      need,
      line.unit,
      { size: line.pack_size, unit: line.pack_unit },
      item.dimension,
    );

    // "Salt, to taste" against a shelf that has some: nothing to buy. There is
    // no amount to compare and the recipe's whole claim is that you need salt.
    if (!converted.ok && converted.reason === "unmeasured") continue;

    // Unconvertible goes on as written and the human decides.
    if (!converted.ok) {
      wanted.push({
        name: line.item_name,
        quantity: need,
        unit: line.unit,
        itemId: item.id,
      });
      already.add(line.item_name.toLowerCase());
      continue;
    }

    /**
     * Everything on the shelf, not just the open container.
     *
     * `quantity` has meant "what is in the OPEN one" since containers arrived.
     * Unspecified means there is some and nobody has said how much, which is
     * not a number to subtract, so it is left off rather than guessed at.
     */
    const onHand = totalOnHand(item);
    if (onHand === null) continue;

    const short = converted.quantity - onHand;
    if (short <= 0) continue;

    wanted.push({
      name: item.name,
      quantity: Math.ceil(short * 100) / 100,
      unit: item.canonical_unit,
      itemId: item.id,
    });
    already.add(item.name.toLowerCase());
  }

  return { wanted, alreadyListed };
}
