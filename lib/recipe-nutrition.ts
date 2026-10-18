import { dimensionOf, resolveAmount } from "./units";
import { estimateFor } from "./generic-nutrition";
import type { Macros } from "./nutrition";
import type { RecipeIngredient } from "./types";

/**
 * What a portion of a recipe is made of.
 *
 * Every figure is per 100g or 100ml, so a recipe's total is just each line
 * converted to canonical units and scaled. The division by servings happens
 * last, at the serving count you are actually cooking.
 *
 * The figures come from the generic-food table only. They used to come from
 * the matching stock row first - its packet's figures, read off Open Food
 * Facts - with the table as the fallback. v2 keeps no stock (18 Oct 2026), so
 * the fallback is the whole answer, and every counted line is an estimate.
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
     * What the food is, from the standard table.
     *
     * "Sesame oil" is sesame oil whatever is in the cupboard, and a recipe's
     * figures are a property of the dish. A food the table does not know is
     * named as missing rather than guessed at: attributing the wrong food's
     * figures is worse than admitting we do not know.
     */
    const generic = estimateFor(line.item_name);
    if (!generic) {
      missing.push(line.item_name);
      continue;
    }

    /**
     * Which kind of quantity this line is. The unit the recipe wrote is the
     * only evidence - "2 cloves" is a count, "30ml" is a volume - and an
     * unrecognised unit is treated as a mass, which is what most of them are.
     */
    const dimension = dimensionOf(line.unit) ?? "mass";

    /**
     * Counted things need a weight before per-100g figures mean anything.
     *
     * "2 eggs" is not 2g of anything. The table knows roughly what one of each
     * weighs - approximate by nature, since a large onion is twice a small one,
     * but an approximate weight beats leaving every counted ingredient out of
     * the total.
     */
    const perUnit = dimension === "count" ? (generic.unitGrams ?? null) : null;
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
      /**
       * A line nobody measured is not a hole in the figures.
       *
       * "Salt, to taste" contributes nothing worth counting and listing it as
       * uncounted would put a pinch of salt next to the 400g of chorizo the
       * total genuinely could not see. Everything else that fails to convert
       * still gets named - that is a real gap.
       */
      if (converted.reason !== "unmeasured") missing.push(line.item_name);
      continue;
    }

    // Every figure is per 100 of the canonical unit, and the quantity is now in
    // that unit, so this is the only arithmetic in the whole file.
    // A count becomes grams; everything else already is its canonical unit.
    const grams = perUnit === null ? converted.quantity : converted.quantity * perUnit;
    const hundreds = grams / 100;
    let contributed = false;

    for (const key of KEYS) {
      const per100 = generic[key];
      if (per100 === null) continue;
      totals[key] = (totals[key] ?? 0) + per100 * hundreds;
      contributed = true;
    }

    if (contributed) {
      counted += 1;
      // Every figure is from the table now, so every counted line is an
      // estimate. Still carried up rather than assumed by the screen, so the
      // day a packet's figures come back (from a receipt line, say) this is
      // the one place that has to learn the difference.
      estimated += 1;
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

/** What a week of planned meals comes to, and how much of it is guesswork. */
export interface WeekMacros extends Macros {
  /** Meals with a recipe on them at all. */
  meals: number;
  /** Of those, how many produced any figures. */
  counted: number;
  /** Portions the week amounts to, which is what the per-portion figure is over. */
  portions: number;
  /** Meals with nothing to go on, by name, so it can say what is missing. */
  missing: string[];
}

/**
 * Adds up a week of planned meals.
 *
 * The question a weekly planner is for is "does this week look reasonable",
 * asked before the shopping rather than after the eating - which is the only
 * moment at which the answer can still change anything.
 *
 * It reports a WEEK total and a PER PORTION average, and the second is the one
 * worth reading. A week total depends on how many people you cooked for, which
 * makes it incomparable with anybody else's week and with your own last week;
 * the average portion is the same shape of number the recipe page already
 * shows, which means the two can be read together.
 *
 * A meal with no figures behind it is named rather than silently dropped. Half
 * a week's ingredients missing from the nutrition tables would otherwise
 * produce a confident total over three dinners, which is worse than no total.
 */
export function weekMacros(
  meals: {
    ingredients: RecipeIngredient[];
    baseServings: number;
    /** What it is planned for, when that is not the recipe's own number. */
    servings: number;
    name: string;
  }[],
): WeekMacros {
  const totals: Record<(typeof KEYS)[number], number | null> = {
    kcal_100: null,
    protein_100: null,
    carbs_100: null,
    fat_100: null,
    fibre_100: null,
    salt_100: null,
  };

  let counted = 0;
  let portions = 0;
  const missing: string[] = [];

  for (const meal of meals) {
    /**
     * Each meal at the servings it is planned for, not at its base.
     *
     * recipeMacros divides by servings to give a portion, so multiplying back
     * up by the same number is what turns it into the whole dish again - and
     * the whole dish is what the week is made of.
     */
    const macros = recipeMacros(
      meal.ingredients,
      meal.servings,
      meal.baseServings,
    );

    if (macros.counted === 0) {
      missing.push(meal.name);
      continue;
    }

    counted += 1;
    portions += meal.servings;

    for (const key of KEYS) {
      const value = macros[key];
      if (value === null) continue;
      totals[key] = (totals[key] ?? 0) + value * meal.servings;
    }
  }

  return {
    ...totals,
    meals: meals.length,
    counted,
    portions,
    missing,
  };
}

/** The same week divided by its portions: what one plate averaged. */
export function perPortion(week: WeekMacros): Macros {
  const over = week.portions > 0 ? week.portions : 1;
  const each = (key: (typeof KEYS)[number]) =>
    week[key] === null ? null : week[key]! / over;

  return {
    kcal_100: each("kcal_100"),
    protein_100: each("protein_100"),
    carbs_100: each("carbs_100"),
    fat_100: each("fat_100"),
    fibre_100: each("fibre_100"),
    salt_100: each("salt_100"),
  };
}
