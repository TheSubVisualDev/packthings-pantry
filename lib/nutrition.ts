/**
 * What a food is made of, and how to say it.
 *
 * This file used to fetch figures too: Open Food Facts by barcode, cached on
 * `products` and copied onto stock rows. That half served the shelves and
 * went with them in v2 (18 Oct 2026). What is left is the vocabulary - the
 * shape of a set of figures and the words for them - which the recipe and
 * week totals still speak, with lib/generic-nutrition.ts as the source.
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
