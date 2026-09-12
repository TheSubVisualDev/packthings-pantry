import { getDb, plainRows } from "./db";
import { getItems } from "./queries";
import { totalOnHand } from "./containers";
import { daysUntil } from "./dates";

/**
 * What this kitchen has actually done - phase 5's P5.
 *
 * Everything here is read from rows the app has been writing since phase 1 and
 * never showing back: cook_events, ratings, tags, expiry dates, and now
 * receipt prices. No new writing, no new schema.
 *
 * Two rules, both from the roadmap and both worth keeping:
 *
 * 1. **Every number leads to the thing it counts.** A statistic you cannot
 *    click is a statistic you cannot check, and an uncheckable number about
 *    your own kitchen is just a claim.
 * 2. **Nothing is shown that needs more data than this kitchen has.** A page
 *    of zeroes in month one is worse than a page that arrives in month three,
 *    so each section returns empty and the screen leaves it out.
 */

export interface CookTotals {
  cooks: number;
  /** Separate evenings, which is the number people mean by "how often". */
  nights: number;
  recipes: number;
  /** Cooks that were the only time that recipe has ever been made. */
  onceOnly: number;
  firstAt: string | null;
}

export interface CookedRecipe {
  recipe_id: number;
  name: string;
  times: number;
  last_at: string;
}

export interface CuisineSlice {
  tag: string;
  times: number;
}

export interface PastIts {
  id: number;
  name: string;
  expiry_date: string;
  daysOver: number;
}

export interface Spend {
  pence: number;
  lines: number;
  since: string;
}

/** The headline row: how much cooking has happened at all. */
export async function getCookTotals(kitchenId: number | null): Promise<CookTotals> {
  const empty = { cooks: 0, nights: 0, recipes: 0, onceOnly: 0, firstAt: null };
  if (kitchenId === null) return empty;

  const result = await getDb().execute({
    sql: `SELECT COUNT(*) AS cooks,
                 COUNT(DISTINCT DATE(cooked_at)) AS nights,
                 COUNT(DISTINCT recipe_id) AS recipes,
                 MIN(cooked_at) AS firstAt
          FROM cook_events
          WHERE kitchen_id = ? AND undone_at IS NULL`,
    args: [kitchenId],
  });

  const once = await getDb().execute({
    sql: `SELECT COUNT(*) AS n FROM (
            SELECT recipe_id FROM cook_events
            WHERE kitchen_id = ? AND undone_at IS NULL
            GROUP BY recipe_id HAVING COUNT(*) = 1
          )`,
    args: [kitchenId],
  });

  const row = plainRows<Omit<CookTotals, "onceOnly">>(result)[0];
  const tail = plainRows<{ n: number }>(once)[0];
  return { ...(row ?? empty), onceOnly: tail?.n ?? 0 };
}

/**
 * What gets cooked, most often first.
 *
 * The long tail is the interesting half - most kitchens have four things they
 * make constantly and thirty they made once - so the caller gets the whole
 * ranking and decides where to cut it.
 */
export async function getCookedRecipes(
  kitchenId: number | null,
  limit = 10,
): Promise<CookedRecipe[]> {
  if (kitchenId === null) return [];

  const result = await getDb().execute({
    sql: `SELECT c.recipe_id, r.name, COUNT(*) AS times, MAX(c.cooked_at) AS last_at
          FROM cook_events c
          JOIN recipes r ON r.id = c.recipe_id
          WHERE c.kitchen_id = ? AND c.undone_at IS NULL
          GROUP BY c.recipe_id
          ORDER BY times DESC, last_at DESC
          LIMIT ?`,
    args: [kitchenId, limit],
  });
  return plainRows<CookedRecipe>(result);
}

/**
 * What kind of food, counted by cooks rather than by recipes.
 *
 * Owning nine Thai recipes and cooking one of them twice a year says less
 * about a kitchen than making the same Korean stew every fortnight.
 */
export async function getCuisines(
  kitchenId: number | null,
  limit = 8,
): Promise<CuisineSlice[]> {
  if (kitchenId === null) return [];

  const result = await getDb().execute({
    sql: `SELECT t.name AS tag, COUNT(*) AS times
          FROM cook_events c
          JOIN recipe_tag_links l ON l.recipe_id = c.recipe_id
          JOIN recipe_tags t ON t.id = l.tag_id
          WHERE c.kitchen_id = ? AND c.undone_at IS NULL
          GROUP BY t.id
          ORDER BY times DESC, t.name
          LIMIT ?`,
    args: [kitchenId, limit],
  });
  return plainRows<CuisineSlice>(result);
}

/**
 * What went past its date with some left in it.
 *
 * The closest thing to a waste number this app can honestly produce. Nothing
 * records a bin: what it knows is that a date has passed and the row still
 * says there is something there, which is either food about to be thrown away
 * or a number nobody has corrected - and both of those are worth seeing.
 *
 * So it is labelled as what it is rather than as "waste", and every line
 * clicks through to the item, where either answer can be given.
 */
export async function getPastItsDate(kitchenId: number | null): Promise<PastIts[]> {
  if (kitchenId === null) return [];

  const items = await getItems(kitchenId);
  const over: PastIts[] = [];

  for (const item of items) {
    if (!item.expiry_date) continue;
    const left = totalOnHand(item);
    if (left !== null && left <= 0) continue;

    // daysUntil returns 0 for an unreadable date, which is not "today" - but
    // it is also not overdue, so the >= 0 test leaves it out either way.
    const days = daysUntil(item.expiry_date);
    if (days >= 0) continue;

    over.push({
      id: item.id,
      name: item.name,
      expiry_date: item.expiry_date,
      daysOver: Math.abs(days),
    });
  }

  return over.sort((a, b) => b.daysOver - a.daysOver);
}

/**
 * What the receipts have added up to, and over what.
 *
 * Only ever from scanned receipts - there is no field anywhere asking anybody
 * to type a price - so this is silent until the scanner has been used, which
 * is the right behaviour for a number that would otherwise read as "you have
 * spent £0 on food".
 */
export async function getSpend(kitchenId: number | null): Promise<Spend | null> {
  if (kitchenId === null) return null;

  const result = await getDb().execute({
    sql: `SELECT SUM(pence) AS pence, COUNT(*) AS lines, MIN(seen_at) AS since
          FROM item_prices WHERE kitchen_id = ?`,
    args: [kitchenId],
  });

  const row = plainRows<{ pence: number | null; lines: number; since: string | null }>(
    result,
  )[0];
  if (!row || !row.pence || row.lines === 0 || !row.since) return null;
  return { pence: row.pence, lines: row.lines, since: row.since };
}
