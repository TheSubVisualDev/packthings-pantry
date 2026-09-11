import { resolveAmount } from "./units";
import type { Macros } from "./nutrition";
import type { Item, RecipeIngredient } from "./types";

/**
 * What a portion of a recipe is made of.
 *
 * Every figure the pantry holds is per 100g or 100ml, so a recipe's total is
 * just each line converted to canonical units and scaled. The division by
 * servings happens last, at the serving count you are actually cooking.
 *
 * The honest part is `counted` and `total`. Half a recipe's ingredients having
 * no figures is normal - spices rarely do - and a confident-looking number over
 * missing data is worse than no number. Coverage travels with the result so it
 * can always be said out loud.
 */

export interface RecipeMacros extends Macros {
  /** Lines that contributed figures. */
  counted: number;
  /** Lines there were. */
  total: number;
  /** Names of the lines that had nothing, so it can say what is missing. */
  missing: string[];
}

const KEYS = [
  "kcal_100",
  "protein_100",
  "carbs_100",
  "fat_100",
  "fibre_100",
  "salt_100",
] as const;

export function recipeMacros(
  ingredients: RecipeIngredient[],
  itemsByName: Map<string, Item>,
  servings: number,
  baseServings: number,
): RecipeMacros {
  const totals: Record<(typeof KEYS)[number], number | null> = {
    kcal_100: null,
    protein_100: null,
    carbs_100: null,
    fat_100: null,
    fibre_100: null,
    salt_100: null,
  };

  let counted = 0;
  const missing: string[] = [];
  const scale = baseServings > 0 ? servings / baseServings : 1;

  for (const line of ingredients) {
    const item = itemsByName.get(line.item_name.toLowerCase());

    /**
     * Counts are skipped rather than guessed at.
     *
     * Figures are per 100g, and "2 eggs" is not 2g of anything - turning a
     * count into a weight needs to know what one weighs, which the pantry has
     * no way of knowing. Better to leave it out and say so.
     */
    if (!item || item.dimension === "count") {
      missing.push(line.item_name);
      continue;
    }

    const converted = resolveAmount(
      line.quantity * scale,
      line.unit,
      { size: line.pack_size, unit: line.pack_unit },
      item.dimension,
    );
    if (!converted.ok) {
      missing.push(line.item_name);
      continue;
    }

    // Every figure is per 100 of the canonical unit, and the quantity is now in
    // that unit, so this is the only arithmetic in the whole file.
    const hundreds = converted.quantity / 100;
    let contributed = false;

    for (const key of KEYS) {
      const per100 = item[key];
      if (per100 === null) continue;
      totals[key] = (totals[key] ?? 0) + per100 * hundreds;
      contributed = true;
    }

    if (contributed) counted += 1;
    else missing.push(line.item_name);
  }

  const perPortion = servings > 0 ? servings : 1;
  // Written out rather than mapped, so the type is checked rather than asserted:
  // a cast here would hide a missing macro instead of failing the build.
  const each = (key: (typeof KEYS)[number]) =>
    totals[key] === null ? null : totals[key]! / perPortion;

  const divided: Macros = {
    kcal_100: each("kcal_100"),
    protein_100: each("protein_100"),
    carbs_100: each("carbs_100"),
    fat_100: each("fat_100"),
    fibre_100: each("fibre_100"),
    salt_100: each("salt_100"),
  };

  return { ...divided, counted, total: ingredients.length, missing };
}
