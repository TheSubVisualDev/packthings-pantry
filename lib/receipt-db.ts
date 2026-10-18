import { getDb, plainRows } from "./db";
import { getMembers } from "./kitchens";
import { amountFromName, type ReceiptMeta } from "./receipt-meta";
import {
  DEFAULT_CATEGORIES,
  MEAL_KINDS,
  aliasKey,
  checklist,
  receiptState,
  sumPence,
  type BoughtLine,
  type ChecklistItem,
  type LineFacts,
  type MealKind,
  type ReceiptFacts,
  type ReceiptState,
  type Settlement,
} from "./receipts";

/**
 * Receipts in and out of the database.
 *
 * Every function takes the kitchen and puts it in the WHERE clause, never in a
 * caller's `if` - docs/AUTHZ-2026-09-15.md. A line has no kitchen column of
 * its own, so a write to one is always scoped through its receipt:
 * `receipt_id IN (SELECT id FROM receipts WHERE kitchen_id = ?)`. That
 * subquery is the whole of the authorisation and it is in every statement
 * that touches a line.
 */

export interface Category {
  id: number;
  name: string;
  position: number;
}

export interface Meal {
  id: number;
  name: string;
  kind: MealKind;
  recipe_id: number | null;
  recipe_name: string | null;
  notes: string | null;
  /** How many lines have been tagged with it. */
  lines: number;
}

export interface Person {
  id: number;
  name: string;
  handle: string;
}

export interface ReceiptRow extends ReceiptFacts {
  shop_name: string | null;
  purchaser_name: string | null;
  raw_text: string | null;
  photo_url: string | null;
  note: string | null;
  created_at: string;
}

export interface LineRow extends LineFacts {
  position: number;
  amount: number | null;
  unit: string | null;
  use_by: string | null;
}

export interface ReceiptSummary extends ReceiptRow {
  line_count: number;
  lines_pence: number;
  checklist: ChecklistItem[];
  state: ReceiptState;
}

const LINE_SCOPE = "receipt_id IN (SELECT id FROM receipts WHERE kitchen_id = ?)";

/**
 * This kitchen's categories, seeded with Sam's list the first time anybody
 * asks.
 *
 * Lazily rather than in the migration or in createKitchen, so there is one
 * place the defaults are written from. The cost is that deleting every
 * category brings the defaults back, which is a fine answer to "there are no
 * categories at all".
 */
export async function getCategories(kitchenId: number): Promise<Category[]> {
  const db = getDb();
  const read = () =>
    db.execute({
      sql: "SELECT id, name, position FROM receipt_categories WHERE kitchen_id = ? ORDER BY position, id",
      args: [kitchenId],
    });
  let result = await read();
  if (result.rows.length === 0) {
    await db.batch(
      DEFAULT_CATEGORIES.map((name, position) => ({
        sql: "INSERT OR IGNORE INTO receipt_categories (kitchen_id, name, position) VALUES (?, ?, ?)",
        args: [kitchenId, name, position],
      })),
      "write",
    );
    result = await read();
  }
  return plainRows<Category>(result);
}

export async function addCategory(kitchenId: number, name: string): Promise<void> {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 40);
  if (!clean) return;
  await getDb().execute({
    sql: `INSERT OR IGNORE INTO receipt_categories (kitchen_id, name, position)
          VALUES (?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM receipt_categories WHERE kitchen_id = ?))`,
    args: [kitchenId, clean, kitchenId],
  });
}

export async function renameCategory(kitchenId: number, id: number, name: string): Promise<void> {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 40);
  if (!clean) return;
  await getDb().execute({
    sql: "UPDATE receipt_categories SET name = ? WHERE id = ? AND kitchen_id = ?",
    args: [clean, id, kitchenId],
  });
}

export async function removeCategory(kitchenId: number, id: number): Promise<void> {
  // Lines and aliases filed under it fall back to uncategorised (SET NULL),
  // which puts them back on the checklist rather than losing them.
  await getDb().execute({
    sql: "DELETE FROM receipt_categories WHERE id = ? AND kitchen_id = ?",
    args: [id, kitchenId],
  });
}

/** Everybody in the kitchen, which is who a line is shared between by default. */
export async function getHousehold(kitchenId: number): Promise<Person[]> {
  const members = await getMembers(kitchenId);
  return members.map((member) => ({
    id: member.user_id,
    name: member.display_name || member.handle,
    handle: member.handle,
  }));
}

export async function getShopsFor(kitchenId: number): Promise<{ id: number; name: string }[]> {
  const result = await getDb().execute({
    sql: "SELECT id, name FROM shops WHERE kitchen_id = ? ORDER BY name COLLATE NOCASE",
    args: [kitchenId],
  });
  return plainRows(result);
}

/** A shop by name, made if it is new. Case-insensitive, like the index. */
export async function shopIdFor(kitchenId: number, name: string): Promise<number | null> {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 40);
  if (!clean) return null;
  const db = getDb();
  await db.execute({
    sql: "INSERT OR IGNORE INTO shops (kitchen_id, name) VALUES (?, ?)",
    args: [kitchenId, clean],
  });
  const found = await db.execute({
    sql: "SELECT id FROM shops WHERE kitchen_id = ? AND LOWER(name) = LOWER(?)",
    args: [kitchenId, clean],
  });
  return (found.rows[0]?.id as number | undefined) ?? null;
}

// --- reading -------------------------------------------------------------

const RECEIPT_SELECT = `
  SELECT r.id, r.bought_on, r.shop_id, r.purchaser_id, r.card_last4, r.total_pence,
         r.status, r.raw_text, r.photo_url, r.note, r.created_at,
         s.name AS shop_name,
         COALESCE(NULLIF(u.display_name, ''), u.handle) AS purchaser_name
  FROM receipts r
  LEFT JOIN shops s ON s.id = r.shop_id
  LEFT JOIN users u ON u.id = r.purchaser_id`;

async function linesFor(kitchenId: number, receiptIds: number[]): Promise<Map<number, LineRow[]>> {
  const out = new Map<number, LineRow[]>();
  if (receiptIds.length === 0) return out;
  const db = getDb();
  const marks = receiptIds.map(() => "?").join(", ");

  const lines = await db.execute({
    sql: `SELECT id, receipt_id, position, raw, name, pence, count, amount, unit,
                 category_id, long_term, snack, used_whole, use_by
          FROM receipt_lines
          WHERE receipt_id IN (${marks}) AND ${LINE_SCOPE}
          ORDER BY position, id`,
    args: [...receiptIds, kitchenId],
  });
  const eaters = await db.execute({
    sql: `SELECT e.line_id, e.user_id FROM receipt_line_eaters e
          JOIN receipt_lines l ON l.id = e.line_id
          WHERE l.receipt_id IN (${marks})`,
    args: receiptIds,
  });
  const meals = await db.execute({
    sql: `SELECT m.line_id, m.meal_id FROM receipt_line_meals m
          JOIN receipt_lines l ON l.id = m.line_id
          WHERE l.receipt_id IN (${marks})`,
    args: receiptIds,
  });

  const eatersBy = new Map<number, number[]>();
  for (const row of eaters.rows) {
    const id = Number(row.line_id);
    eatersBy.set(id, [...(eatersBy.get(id) ?? []), Number(row.user_id)]);
  }
  const mealsBy = new Map<number, number[]>();
  for (const row of meals.rows) {
    const id = Number(row.line_id);
    mealsBy.set(id, [...(mealsBy.get(id) ?? []), Number(row.meal_id)]);
  }

  for (const row of plainRows<LineRow & { receipt_id: number }>(lines)) {
    const line: LineRow = {
      ...row,
      eaters: eatersBy.get(row.id) ?? [],
      meals: mealsBy.get(row.id) ?? [],
    };
    out.set(row.receipt_id, [...(out.get(row.receipt_id) ?? []), line]);
  }
  return out;
}

function summarise(receipt: ReceiptRow, lines: LineRow[]): ReceiptSummary {
  const items = checklist(receipt, lines);
  return {
    ...receipt,
    line_count: lines.length,
    lines_pence: sumPence(lines),
    checklist: items,
    state: receiptState(receipt, items),
  };
}

/**
 * The inbox: every receipt, with its checklist worked out.
 *
 * Open ones first, the ones that need the most first among those, then by
 * date. Closed receipts come back too and the screen hides them - they still
 * count in the split and the spend.
 */
export async function listReceipts(kitchenId: number): Promise<ReceiptSummary[]> {
  const result = await getDb().execute({
    sql: `${RECEIPT_SELECT} WHERE r.kitchen_id = ?
          ORDER BY COALESCE(r.bought_on, substr(r.created_at, 1, 10)) DESC, r.id DESC`,
    args: [kitchenId],
  });
  const receipts = plainRows<ReceiptRow>(result);
  const lines = await linesFor(kitchenId, receipts.map((r) => r.id));
  return receipts.map((receipt) => summarise(receipt, lines.get(receipt.id) ?? []));
}

export async function getReceipt(
  kitchenId: number,
  id: number,
): Promise<{ receipt: ReceiptSummary; lines: LineRow[] } | null> {
  const result = await getDb().execute({
    sql: `${RECEIPT_SELECT} WHERE r.kitchen_id = ? AND r.id = ?`,
    args: [kitchenId, id],
  });
  const receipt = plainRows<ReceiptRow>(result)[0];
  if (!receipt) return null;
  const lines = (await linesFor(kitchenId, [id])).get(id) ?? [];
  return { receipt: summarise(receipt, lines), lines };
}

// --- writing a new receipt -----------------------------------------------

export interface IncomingLine {
  raw: string | null;
  name: string;
  pence: number | null;
  count: number;
}

/**
 * Saves a receipt, filling in everything this kitchen has been told before.
 *
 * Three kinds of remembering, all of them the "learns from itself" in Sam's
 * outline: a till's wording already explained (name, category, long-term,
 * amount), a card already known to be somebody's, and a shop already in the
 * list. Anything not known stays blank and lands on the checklist.
 *
 * Nothing about stock. In v1 a receipt was a way of filling shelves; here the
 * receipt is the record, and saving one is all that happens.
 */
export async function createReceipt(
  kitchenId: number,
  userId: number,
  input: {
    meta: ReceiptMeta;
    lines: IncomingLine[];
    rawText: string | null;
    photoUrl?: string | null;
  },
): Promise<number> {
  const db = getDb();

  const shopId = input.meta.shop ? await shopIdFor(kitchenId, input.meta.shop) : null;

  let purchaser: number | null = null;
  if (input.meta.cardLast4) {
    const card = await db.execute({
      sql: "SELECT user_id FROM payment_cards WHERE kitchen_id = ? AND last4 = ?",
      args: [kitchenId, input.meta.cardLast4],
    });
    purchaser = (card.rows[0]?.user_id as number | undefined) ?? null;
  }

  const keys = [...new Set(input.lines.map((line) => aliasKey(line.raw ?? line.name)).filter(Boolean))];
  const known = new Map<string, { name: string; category_id: number | null; long_term: number; amount: number | null; unit: string | null }>();
  if (keys.length > 0) {
    const aliases = await db.execute({
      sql: `SELECT key, name, category_id, long_term, amount, unit FROM receipt_aliases
            WHERE kitchen_id = ? AND key IN (${keys.map(() => "?").join(", ")})`,
      args: [kitchenId, ...keys],
    });
    for (const row of plainRows<{ key: string; name: string; category_id: number | null; long_term: number; amount: number | null; unit: string | null }>(aliases)) {
      known.set(row.key, row);
    }
  }

  const tx = await db.transaction("write");
  try {
    const created = await tx.execute({
      sql: `INSERT INTO receipts (kitchen_id, bought_on, shop_id, purchaser_id, card_last4,
                                  total_pence, raw_text, photo_url, created_by, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) RETURNING id`,
      args: [
        kitchenId,
        input.meta.boughtOn,
        shopId,
        purchaser,
        input.meta.cardLast4,
        input.meta.totalPence,
        input.rawText,
        input.photoUrl ?? null,
        userId,
      ],
    });
    const receiptId = Number(created.rows[0].id);

    for (const [position, line] of input.lines.entries()) {
      const alias = known.get(aliasKey(line.raw ?? line.name));
      const measured = alias?.amount != null ? { amount: alias.amount, unit: alias.unit } : amountFromName(line.name);
      await tx.execute({
        sql: `INSERT INTO receipt_lines (receipt_id, position, raw, name, pence, count, amount, unit,
                                         category_id, long_term)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          receiptId,
          position,
          line.raw,
          alias?.name ?? line.name,
          line.pence,
          Math.max(1, Math.min(99, Math.round(line.count) || 1)),
          measured?.amount ?? null,
          measured?.unit ?? null,
          alias?.category_id ?? null,
          alias?.long_term ?? 0,
        ],
      });
    }

    await tx.commit();
    return receiptId;
  } finally {
    tx.close();
  }
}

// --- editing -------------------------------------------------------------

export interface ReceiptPatch {
  bought_on?: string | null;
  shop_id?: number | null;
  purchaser_id?: number | null;
  card_last4?: string | null;
  total_pence?: number | null;
  note?: string | null;
}

const RECEIPT_FIELDS = ["bought_on", "shop_id", "purchaser_id", "card_last4", "total_pence", "note"] as const;

/**
 * Changes a receipt's own facts, and learns the card if this told us whose it is.
 *
 * Who paid is the one thing on a receipt that the next one can answer for
 * itself, so the first time a person is named against four digits, those four
 * digits become theirs. Later answers overwrite: a card changes hands rarely,
 * but a wrong guess corrected should stay corrected.
 */
export async function updateReceipt(kitchenId: number, id: number, patch: ReceiptPatch): Promise<void> {
  const fields = RECEIPT_FIELDS.filter((field) => field in patch);
  if (fields.length === 0) return;
  const db = getDb();
  await db.execute({
    sql: `UPDATE receipts SET ${fields.map((field) => `${field} = ?`).join(", ")}, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND kitchen_id = ?`,
    args: [...fields.map((field) => patch[field] ?? null), id, kitchenId],
  });

  if ("purchaser_id" in patch || "card_last4" in patch) {
    const row = await db.execute({
      sql: "SELECT purchaser_id, card_last4 FROM receipts WHERE id = ? AND kitchen_id = ?",
      args: [id, kitchenId],
    });
    const found = row.rows[0] as unknown as { purchaser_id: number | null; card_last4: string | null } | undefined;
    if (found?.purchaser_id && found.card_last4) {
      await db.execute({
        sql: `INSERT INTO payment_cards (kitchen_id, last4, user_id) VALUES (?, ?, ?)
              ON CONFLICT (kitchen_id, last4) DO UPDATE SET user_id = excluded.user_id`,
        args: [kitchenId, found.card_last4, found.purchaser_id],
      });
    }
  }
}

export async function setReceiptStatus(kitchenId: number, id: number, status: "open" | "closed"): Promise<void> {
  await getDb().execute({
    sql: `UPDATE receipts SET status = ?, closed_at = ${status === "closed" ? "CURRENT_TIMESTAMP" : "NULL"},
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND kitchen_id = ?`,
    args: [status, id, kitchenId],
  });
}

export async function deleteReceipt(kitchenId: number, id: number): Promise<void> {
  await getDb().execute({
    sql: "DELETE FROM receipts WHERE id = ? AND kitchen_id = ?",
    args: [id, kitchenId],
  });
}

export interface LinePatch {
  name?: string;
  pence?: number | null;
  count?: number;
  amount?: number | null;
  unit?: string | null;
  category_id?: number | null;
  long_term?: number;
  snack?: number;
  used_whole?: number;
  use_by?: string | null;
}

const LINE_FIELDS = ["name", "pence", "count", "amount", "unit", "category_id", "long_term", "snack", "used_whole", "use_by"] as const;

/** The parts of a line that are about what the thing IS, and so worth remembering. */
const LEARNED = new Set(["name", "category_id", "long_term", "amount", "unit"]);

/**
 * Changes a line, and remembers the answer against the till's wording.
 *
 * Only what the thing is gets remembered - its name, category, whether it is
 * long-term, how much of it there is. Not the price, which changes, and not
 * who ate it or which meal it went to, which are about this shop rather than
 * about the product.
 */
export async function updateLine(kitchenId: number, lineId: number, patch: LinePatch): Promise<void> {
  const fields = LINE_FIELDS.filter((field) => field in patch);
  if (fields.length === 0) return;
  const db = getDb();
  await db.execute({
    sql: `UPDATE receipt_lines SET ${fields.map((field) => `${field} = ?`).join(", ")}
          WHERE id = ? AND ${LINE_SCOPE}`,
    args: [...fields.map((field) => patch[field] ?? null), lineId, kitchenId],
  });

  if (fields.some((field) => LEARNED.has(field))) await learnLine(kitchenId, lineId);

  /**
   * Somebody's snack is theirs alone.
   *
   * Ticking it as a snack throws away the shared-by list, which was about a
   * household line that has just stopped being one. The person comes from
   * setEaters after this, and none means "for somebody outside the house".
   */
  if (patch.snack === 1) {
    await db.execute({
      sql: `DELETE FROM receipt_line_eaters WHERE line_id = (SELECT id FROM receipt_lines WHERE id = ? AND ${LINE_SCOPE})`,
      args: [lineId, kitchenId],
    });
  }
}

async function learnLine(kitchenId: number, lineId: number): Promise<void> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT raw, name, category_id, long_term, amount, unit FROM receipt_lines
          WHERE id = ? AND ${LINE_SCOPE}`,
    args: [lineId, kitchenId],
  });
  const line = result.rows[0] as unknown as
    | { raw: string | null; name: string; category_id: number | null; long_term: number; amount: number | null; unit: string | null }
    | undefined;
  // A line typed in by hand has no till wording to learn against.
  if (!line?.raw) return;
  const key = aliasKey(line.raw);
  if (!key) return;
  await db.execute({
    sql: `INSERT INTO receipt_aliases (kitchen_id, key, name, category_id, long_term, amount, unit, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT (kitchen_id, key) DO UPDATE SET
            name = excluded.name, category_id = excluded.category_id,
            long_term = excluded.long_term, amount = excluded.amount, unit = excluded.unit,
            updated_at = CURRENT_TIMESTAMP`,
    args: [kitchenId, key, line.name, line.category_id, line.long_term, line.amount, line.unit],
  });
}

export async function addLine(kitchenId: number, receiptId: number, line: IncomingLine): Promise<number | null> {
  const measured = amountFromName(line.name);
  const result = await getDb().execute({
    sql: `INSERT INTO receipt_lines (receipt_id, position, raw, name, pence, count, amount, unit)
          SELECT r.id, (SELECT COALESCE(MAX(position), -1) + 1 FROM receipt_lines WHERE receipt_id = r.id),
                 ?, ?, ?, ?, ?, ?
          FROM receipts r WHERE r.id = ? AND r.kitchen_id = ?
          RETURNING id`,
    args: [line.raw, line.name, line.pence, line.count, measured?.amount ?? null, measured?.unit ?? null, receiptId, kitchenId],
  });
  return (result.rows[0]?.id as number | undefined) ?? null;
}

export async function deleteLine(kitchenId: number, lineId: number): Promise<void> {
  await getDb().execute({
    sql: `DELETE FROM receipt_lines WHERE id = ? AND ${LINE_SCOPE}`,
    args: [lineId, kitchenId],
  });
}

/**
 * Who shares a line. Only people in the household can be named: a stranger's
 * id would put a balance against somebody who cannot see it.
 */
export async function setEaters(kitchenId: number, lineId: number, people: number[]): Promise<void> {
  const db = getDb();
  const household = new Set((await getHousehold(kitchenId)).map((person) => person.id));
  const wanted = [...new Set(people)].filter((id) => household.has(id));
  const owned = await db.execute({
    sql: `SELECT id FROM receipt_lines WHERE id = ? AND ${LINE_SCOPE}`,
    args: [lineId, kitchenId],
  });
  if (owned.rows.length === 0) return;
  await db.batch(
    [
      { sql: "DELETE FROM receipt_line_eaters WHERE line_id = ?", args: [lineId] },
      ...wanted.map((id) => ({
        sql: "INSERT INTO receipt_line_eaters (line_id, user_id) VALUES (?, ?)",
        args: [lineId, id],
      })),
    ],
    "write",
  );
}

/**
 * Which meals a line went towards.
 *
 * A line used up whole goes to one meal - the pack of mince is in the spag bol
 * and nowhere else - so a second tag replaces the first rather than joining it.
 * Otherwise up to three, which is as many as Sam's outline imagines a pack of
 * chicken stretching to.
 */
export async function setLineMeals(kitchenId: number, lineId: number, mealIds: number[]): Promise<void> {
  const db = getDb();
  const owned = await db.execute({
    sql: `SELECT used_whole FROM receipt_lines WHERE id = ? AND ${LINE_SCOPE}`,
    args: [lineId, kitchenId],
  });
  if (owned.rows.length === 0) return;
  const whole = Number(owned.rows[0].used_whole) === 1;
  const mine = await db.execute({
    sql: `SELECT id FROM meals WHERE kitchen_id = ? AND id IN (${mealIds.map(() => "?").join(", ") || "NULL"})`,
    args: [kitchenId, ...mealIds],
  });
  const valid = new Set(mine.rows.map((row) => Number(row.id)));
  let wanted = [...new Set(mealIds)].filter((id) => valid.has(id));
  wanted = whole ? wanted.slice(-1) : wanted.slice(0, 3);
  await db.batch(
    [
      { sql: "DELETE FROM receipt_line_meals WHERE line_id = ?", args: [lineId] },
      ...wanted.map((id) => ({
        sql: "INSERT INTO receipt_line_meals (line_id, meal_id) VALUES (?, ?)",
        args: [lineId, id],
      })),
    ],
    "write",
  );
}

// --- meals ---------------------------------------------------------------

export async function getMeals(kitchenId: number): Promise<Meal[]> {
  const result = await getDb().execute({
    sql: `SELECT m.id, m.name, m.kind, m.recipe_id, r.name AS recipe_name, m.notes,
            (SELECT COUNT(*) FROM receipt_line_meals lm WHERE lm.meal_id = m.id) AS lines
          FROM meals m LEFT JOIN recipes r ON r.id = m.recipe_id
          WHERE m.kitchen_id = ?
          ORDER BY lines DESC, m.name COLLATE NOCASE`,
    args: [kitchenId],
  });
  return plainRows<Meal>(result);
}

export async function getMeal(kitchenId: number, id: number): Promise<Meal | null> {
  return (await getMeals(kitchenId)).find((meal) => meal.id === id) ?? null;
}

/** A meal by name, made if new - so tagging a line is also how a meal is born. */
export async function mealIdFor(kitchenId: number, name: string, kind: MealKind = "riff"): Promise<number | null> {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 60);
  if (!clean) return null;
  const db = getDb();
  await db.execute({
    sql: "INSERT OR IGNORE INTO meals (kitchen_id, name, kind) VALUES (?, ?, ?)",
    args: [kitchenId, clean, MEAL_KINDS.includes(kind) ? kind : "riff"],
  });
  const found = await db.execute({
    sql: "SELECT id FROM meals WHERE kitchen_id = ? AND LOWER(name) = LOWER(?)",
    args: [kitchenId, clean],
  });
  return (found.rows[0]?.id as number | undefined) ?? null;
}

export async function updateMeal(
  kitchenId: number,
  id: number,
  patch: { name?: string; kind?: MealKind; recipe_id?: number | null; notes?: string | null },
): Promise<void> {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if (patch.name !== undefined) {
    const clean = patch.name.replace(/\s+/g, " ").trim().slice(0, 60);
    if (clean) {
      sets.push("name = ?");
      args.push(clean);
    }
  }
  if (patch.kind !== undefined && MEAL_KINDS.includes(patch.kind)) {
    sets.push("kind = ?");
    args.push(patch.kind);
  }
  if (patch.recipe_id !== undefined) {
    sets.push("recipe_id = ?");
    args.push(patch.recipe_id);
  }
  if (patch.notes !== undefined) {
    sets.push("notes = ?");
    args.push(patch.notes);
  }
  if (sets.length === 0) return;
  await getDb().execute({
    sql: `UPDATE meals SET ${sets.join(", ")} WHERE id = ? AND kitchen_id = ?`,
    args: [...args, id, kitchenId],
  });
}

export async function deleteMeal(kitchenId: number, id: number): Promise<void> {
  await getDb().execute({
    sql: "DELETE FROM meals WHERE id = ? AND kitchen_id = ?",
    args: [id, kitchenId],
  });
}

// --- the history ---------------------------------------------------------

/**
 * Every priced line this kitchen has bought, flattened for the analysis.
 *
 * Receipts with no date are left out: every question asked of this is "when",
 * and a line with no day would land in whatever period a guess put it in.
 * They are on the checklist, which is the right place for them.
 */
export async function getBoughtLines(kitchenId: number, mealId?: number): Promise<BoughtLine[]> {
  const result = await getDb().execute({
    sql: `SELECT l.name, l.pence, l.count, l.amount, l.unit, r.bought_on, s.name AS shop,
                 c.name AS category, l.snack, l.long_term, r.id AS receipt_id
          FROM receipt_lines l
          JOIN receipts r ON r.id = l.receipt_id
          LEFT JOIN shops s ON s.id = r.shop_id
          LEFT JOIN receipt_categories c ON c.id = l.category_id
          ${mealId ? "JOIN receipt_line_meals lm ON lm.line_id = l.id AND lm.meal_id = ?" : ""}
          WHERE r.kitchen_id = ? AND r.bought_on IS NOT NULL
          ORDER BY r.bought_on`,
    args: mealId ? [mealId, kitchenId] : [kitchenId],
  });
  return plainRows<BoughtLine>(result);
}

/** Every receipt with its lines, for the split. */
export async function getSplitInput(
  kitchenId: number,
): Promise<{ receipt: ReceiptFacts; lines: LineFacts[] }[]> {
  const result = await getDb().execute({
    sql: `SELECT id, bought_on, shop_id, purchaser_id, card_last4, total_pence, status
          FROM receipts WHERE kitchen_id = ?`,
    args: [kitchenId],
  });
  const receipts = plainRows<ReceiptFacts>(result);
  const lines = await linesFor(kitchenId, receipts.map((r) => r.id));
  return receipts.map((receipt) => ({ receipt, lines: lines.get(receipt.id) ?? [] }));
}

export interface SettlementRow extends Settlement {
  id: number;
  on_date: string;
  note: string | null;
}

export async function getSettlements(kitchenId: number): Promise<SettlementRow[]> {
  const result = await getDb().execute({
    sql: `SELECT id, from_user, to_user, pence, on_date, note FROM settlements
          WHERE kitchen_id = ? ORDER BY on_date DESC, id DESC`,
    args: [kitchenId],
  });
  return plainRows<SettlementRow>(result);
}

export async function addSettlement(
  kitchenId: number,
  userId: number,
  payment: { from_user: number; to_user: number; pence: number; on_date: string; note?: string | null },
): Promise<boolean> {
  const household = new Set((await getHousehold(kitchenId)).map((person) => person.id));
  if (!household.has(payment.from_user) || !household.has(payment.to_user)) return false;
  if (payment.from_user === payment.to_user || !(payment.pence > 0)) return false;
  await getDb().execute({
    sql: `INSERT INTO settlements (kitchen_id, from_user, to_user, pence, on_date, note, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [kitchenId, payment.from_user, payment.to_user, payment.pence, payment.on_date, payment.note ?? null, userId],
  });
  return true;
}

export async function deleteSettlement(kitchenId: number, id: number): Promise<void> {
  await getDb().execute({
    sql: "DELETE FROM settlements WHERE id = ? AND kitchen_id = ?",
    args: [id, kitchenId],
  });
}

/**
 * Receipts with a line matching a name or a category - how a number on the
 * spend page leads back to the receipts it was counted from.
 */
export async function receiptIdsMatching(
  kitchenId: number,
  query: string,
  categoryId: number | null,
): Promise<Set<number>> {
  const result = await getDb().execute({
    sql: `SELECT DISTINCT l.receipt_id FROM receipt_lines l
          JOIN receipts r ON r.id = l.receipt_id
          WHERE r.kitchen_id = ?
            AND (? = '' OR LOWER(l.name) LIKE '%' || ? || '%')
            AND (? IS NULL OR l.category_id = ?)`,
    args: [kitchenId, query, query, categoryId, categoryId],
  });
  return new Set(result.rows.map((row) => Number(row.receipt_id)));
}
