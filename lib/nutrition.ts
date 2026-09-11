import { getDb } from "./db";
import { lookupOpenFoodFacts, type Nutrition } from "./off";
import { estimateFor } from "./generic-nutrition";

/**
 * Nutrition, fetched once and then read from our own database.
 *
 * Open Food Facts is free, volunteer-run and asks for restraint. A barcode's
 * product does not change its recipe, so asking a second time is spending
 * somebody else's machine to learn what we already know. Everything here is
 * built around that: the catalogue is touched on a miss, and never again.
 *
 * The cache lives on `products`, keyed by barcode, because that is the thing
 * the figures actually describe. Items get a copy so that grouping and sorting
 * a whole shelf is one query against one table rather than a join per row.
 */

export interface Macros {
  kcal_100: number | null;
  protein_100: number | null;
  carbs_100: number | null;
  fat_100: number | null;
  fibre_100: number | null;
  salt_100: number | null;
}

/** Energy per gram, for working out which macro a food mostly is. */
const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 } as const;

export type Macro = keyof typeof KCAL_PER_GRAM;

/**
 * Which macronutrient a food mostly is, by energy rather than by weight.
 *
 * By weight nearly everything is "carbs", because fat is light and packs more
 * than twice the energy per gram. Butter is 81g fat and 1g carbohydrate per
 * 100g, and cheese would read as protein on weight alone while being mostly
 * fat. Energy share is what people mean when they call something a fat or a
 * protein.
 *
 * Null when there is not enough to say - which is honest, and better than
 * defaulting everything unknown into one misleading bucket.
 */
export function dominantMacro(macros: Macros): Macro | null {
  const energy = {
    protein: (macros.protein_100 ?? 0) * KCAL_PER_GRAM.protein,
    carbs: (macros.carbs_100 ?? 0) * KCAL_PER_GRAM.carbs,
    fat: (macros.fat_100 ?? 0) * KCAL_PER_GRAM.fat,
  };

  const total = energy.protein + energy.carbs + energy.fat;
  if (total <= 0) return null;

  return (Object.keys(energy) as Macro[]).reduce((best, macro) =>
    energy[macro] > energy[best] ? macro : best,
  );
}

/** Share of energy the dominant macro accounts for, 0 to 1. */
export function macroShare(macros: Macros, macro: Macro): number {
  const energy =
    (macros.protein_100 ?? 0) * KCAL_PER_GRAM.protein +
    (macros.carbs_100 ?? 0) * KCAL_PER_GRAM.carbs +
    (macros.fat_100 ?? 0) * KCAL_PER_GRAM.fat;
  if (energy <= 0) return 0;

  const amount =
    macro === "protein"
      ? (macros.protein_100 ?? 0) * KCAL_PER_GRAM.protein
      : macro === "carbs"
        ? (macros.carbs_100 ?? 0) * KCAL_PER_GRAM.carbs
        : (macros.fat_100 ?? 0) * KCAL_PER_GRAM.fat;

  return amount / energy;
}

const LABELS: Record<Macro, string> = {
  protein: "Protein",
  carbs: "Carbs",
  fat: "Fat",
};

/**
 * What to file a food under on a shelf.
 *
 * "Mostly" when one macro is more than half the energy, plain otherwise -
 * because "Protein" on something that is 35% protein would be a claim the
 * numbers do not support.
 */
export function macroGroup(macros: Macros): string {
  const macro = dominantMacro(macros);
  if (!macro) return "Not known";
  return macroShare(macros, macro) >= 0.5 ? `Mostly ${LABELS[macro].toLowerCase()}` : LABELS[macro];
}

const EMPTY: Macros = {
  kcal_100: null,
  protein_100: null,
  carbs_100: null,
  fat_100: null,
  fibre_100: null,
  salt_100: null,
};

/** Whether anything at all is known. */
export function hasMacros(macros: Macros): boolean {
  return Object.values(macros).some((value) => value !== null);
}

function toMacros(nutrition: Nutrition | null): Macros {
  if (!nutrition) return EMPTY;
  return {
    kcal_100: nutrition.kcal,
    protein_100: nutrition.protein,
    carbs_100: nutrition.carbs,
    fat_100: nutrition.fat,
    fibre_100: nutrition.fibre,
    salt_100: nutrition.salt,
  };
}

/**
 * Nutrition for a barcode, from our own database if we have ever looked.
 *
 * `nutrition_checked_at` is what makes this a cache rather than a guess: a row
 * with a date and all-null figures means the catalogue was asked and does not
 * know, which is an answer worth keeping. Without it every unknown product
 * would be re-fetched on every single scan, which is exactly the spamming this
 * is here to avoid.
 */
export async function macrosForBarcode(barcode: string): Promise<Macros> {
  const db = getDb();

  const cached = await db.execute({
    sql: `SELECT kcal_100, protein_100, carbs_100, fat_100, fibre_100, salt_100,
                 nutrition_checked_at
          FROM products WHERE barcode = ?`,
    args: [barcode],
  });
  const row = cached.rows[0] as unknown as
    | (Macros & { nutrition_checked_at: string | null })
    | undefined;

  if (row?.nutrition_checked_at) {
    return {
      kcal_100: row.kcal_100,
      protein_100: row.protein_100,
      carbs_100: row.carbs_100,
      fat_100: row.fat_100,
      fibre_100: row.fibre_100,
      salt_100: row.salt_100,
    };
  }

  const product = await lookupOpenFoodFacts(barcode);
  const macros = toMacros(product?.nutrition ?? null);

  // Stamped even when nothing came back, so the miss is remembered too. Only
  // updates a row that exists: the scan flow creates it, and a barcode nobody
  // has kept is not ours to write.
  await db.execute({
    sql: `UPDATE products
          SET kcal_100 = ?, protein_100 = ?, carbs_100 = ?, fat_100 = ?,
              fibre_100 = ?, salt_100 = ?, nutrition_checked_at = CURRENT_TIMESTAMP
          WHERE barcode = ?`,
    args: [
      macros.kcal_100,
      macros.protein_100,
      macros.carbs_100,
      macros.fat_100,
      macros.fibre_100,
      macros.salt_100,
      barcode,
    ],
  });

  return macros;
}

/**
 * Copies a barcode's figures onto the item it was linked to.
 *
 * A scan replaces an estimate outright rather than filling round it. The
 * standard figure for "milk" is a reasonable guess; what the carton actually
 * says is better, and leaving half a guess mixed into a scan would produce a
 * row that is neither and is labelled as one.
 *
 * It never replaces figures a person entered. Somebody who typed them meant
 * them, and a packet they did not scan is not an argument against that.
 */
export async function copyMacrosToItem(
  kitchenId: number,
  itemId: number,
  macros: Macros,
): Promise<void> {
  if (!hasMacros(macros)) return;

  await getDb().execute({
    sql: `UPDATE items
          SET kcal_100 = ?, protein_100 = ?, carbs_100 = ?, fat_100 = ?,
              fibre_100 = ?, salt_100 = ?, nutrition_source = 'scan'
          WHERE id = ? AND kitchen_id = ?
            AND (nutrition_source IS NULL OR nutrition_source <> 'manual')`,
    args: [
      macros.kcal_100,
      macros.protein_100,
      macros.carbs_100,
      macros.fat_100,
      macros.fibre_100,
      macros.salt_100,
      itemId,
      kitchenId,
    ],
  });
}

/**
 * Fills in standard figures for things no barcode will ever cover.
 *
 * Saved rather than computed on the fly, because the whole pantry groups and
 * sorts on these columns and a join per row to work out that carrots are
 * carrots would be paid on every page. `nutrition_source` is what keeps that
 * honest: the guess sits in the same columns as a scan and says, next to
 * itself, that it is a guess.
 *
 * Only fills items that have nothing. A scan is a better answer than a standard
 * table, and a person typing it is better still, so neither is overwritten -
 * which is also why a re-run costs nothing and can be done whenever the table
 * of generics grows.
 */
export async function estimateMissing(
  kitchenId: number,
): Promise<{ item_id: number; name: string; basis: string }[]> {
  const db = getDb();

  const blank = await db.execute({
    sql: `SELECT id, name FROM items
          WHERE kitchen_id = ?
            AND nutrition_source IS NULL
            AND kcal_100 IS NULL AND protein_100 IS NULL
            AND carbs_100 IS NULL AND fat_100 IS NULL`,
    args: [kitchenId],
  });

  const done: { item_id: number; name: string; basis: string }[] = [];

  for (const row of blank.rows as unknown as { id: number; name: string }[]) {
    const generic = estimateFor(row.name);
    if (!generic) continue;

    await db.execute({
      sql: `UPDATE items
            SET kcal_100 = ?, protein_100 = ?, carbs_100 = ?, fat_100 = ?,
                fibre_100 = ?, salt_100 = ?, nutrition_source = 'estimate'
            WHERE id = ? AND kitchen_id = ?`,
      args: [
        generic.kcal_100,
        generic.protein_100,
        generic.carbs_100,
        generic.fat_100,
        generic.fibre_100,
        generic.salt_100,
        row.id,
        kitchenId,
      ],
    });

    done.push({ item_id: row.id, name: row.name, basis: generic.label });
  }

  return done;
}
