import { dimensionOf, resolveAmount } from "./units";
import { STRONG_MATCH, rankItems } from "./match";
import { estimateFor } from "./generic-nutrition";
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
  /** How many of the counted lines rested on a standard figure, not a packet. */
  estimated: number;
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
  let estimated = 0;
  const missing: string[] = [];
  const scale = baseServings > 0 ? servings / baseServings : 1;

  for (const line of ingredients) {
    /**
     * The stock row this line means.
     *
     * Exact name first, then the same scorer the barcode and receipt matchers
     * use, because a recipe saying "Onion" and a shelf saying "Brown Onions"
     * are the same onion. Only a strong match counts: attributing the wrong
     * food's figures is worse than admitting we do not know.
     */
    const item =
      itemsByName.get(line.item_name.toLowerCase()) ??
      (() => {
        const best = rankItems(line.item_name, null, null, [...itemsByName.values()])[0];
        return best && best.score >= STRONG_MATCH ? best.item : undefined;
      })();

    /**
     * Counts are skipped rather than guessed at.
     *
     * Figures are per 100g, and "2 eggs" is not 2g of anything - turning a
     * count into a weight needs to know what one weighs, which the pantry has
     * no way of knowing. Better to leave it out and say so.
     */
    /**
     * Nothing on the shelf, but the recipe still named a food.
     *
     * "Sesame oil" is sesame oil whether or not this kitchen has any, and a
     * recipe's figures should not depend on what is in the cupboard today -
     * they are a property of the dish. So an unstocked line falls back to the
     * standard table, counted as an estimate like any other guess.
     */
    const generic = item ? null : estimateFor(line.item_name);
    if (!item && !generic) {
      missing.push(line.item_name);
      continue;
    }

    /**
     * Counted things need a weight before per-100g figures mean anything.
     *
     * "2 eggs" is not 2g of anything. The generics table knows roughly what
     * one of each weighs, which is approximate by nature - a large onion is
     * twice a small one - but an approximate weight beats leaving every
     * counted ingredient out of the total, which is what used to happen.
     */
    // Figures from the shelf if it is there, from the table if it is not.
    const figures: Macros = item ?? generic!;
    const fromTable = !item;

    /**
     * Which kind of quantity this line is.
     *
     * A stock row says so outright. Without one, the unit the recipe wrote is
     * the only evidence - "2 cloves" is a count, "30ml" is a volume - and an
     * unrecognised unit is treated as a mass, which is what most of them are.
     */
    const dimension = item?.dimension ?? dimensionOf(line.unit) ?? "mass";

    /**
     * Counted things need a weight before per-100g figures mean anything.
     *
     * "2 eggs" is not 2g of anything. The generics table knows roughly what one
     * of each weighs - approximate by nature, since a large onion is twice a
     * small one, but an approximate weight beats leaving every counted
     * ingredient out of the total.
     */
    const perUnit =
      dimension === "count"
        ? (generic ?? estimateFor(item!.name))?.unitGrams ?? null
        : null;
    if (dimension === "count" && perUnit === null) {
      missing.push(line.item_name);
      continue;
    }

    const converted = resolveAmount(
      line.quantity * scale,
      line.unit,
      { size: line.pack_size, unit: line.pack_unit },
      dimension,
    );
    if (!converted.ok) {
      missing.push(line.item_name);
      continue;
    }

    // Every figure is per 100 of the canonical unit, and the quantity is now in
    // that unit, so this is the only arithmetic in the whole file.
    // A count becomes grams; everything else already is its canonical unit.
    const grams = perUnit === null ? converted.quantity : converted.quantity * perUnit;
    const hundreds = grams / 100;
    let contributed = false;

    for (const key of KEYS) {
      const per100 = figures[key];
      if (per100 === null) continue;
      totals[key] = (totals[key] ?? 0) + per100 * hundreds;
      contributed = true;
    }

    if (contributed) {
      counted += 1;
      // Worth carrying up: a total resting on standard figures is a different
      // claim from one resting on packets, and "roughly" should say why.
      if (fromTable || item?.nutrition_source === "estimate") estimated += 1;
    }
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

  return { ...divided, counted, estimated, total: ingredients.length, missing };
}
