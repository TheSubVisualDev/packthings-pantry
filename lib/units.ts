import type { CanonicalUnit, Dimension } from "./types";

/**
 * Conversion factors to each dimension's canonical unit. Hardcoded on purpose -
 * this is code, not user-maintained data. UK measurements throughout, no cups.
 */
const FACTORS: Record<string, { dimension: Dimension; toCanonical: number }> = {
  // mass -> g
  kg: { dimension: "mass", toCanonical: 1000 },
  g: { dimension: "mass", toCanonical: 1 },
  // volume -> ml
  l: { dimension: "volume", toCanonical: 1000 },
  ml: { dimension: "volume", toCanonical: 1 },
  tbsp: { dimension: "volume", toCanonical: 15 },
  tsp: { dimension: "volume", toCanonical: 5 },
  // count has no conversion. tin, pack and jar are the same dimension with the
  // same factor: they exist so a recipe can say "1 tin of tomatoes" and read
  // like a recipe. A tin is deliberately not 400g - tins aren't all 400g, and a
  // unit whose factor depends on the product would break the one rule this
  // table has. The size, when it matters, goes in the ingredient's note.
  count: { dimension: "count", toCanonical: 1 },
  tin: { dimension: "count", toCanonical: 1 },
  pack: { dimension: "count", toCanonical: 1 },
  jar: { dimension: "count", toCanonical: 1 },
};

export const CANONICAL_FOR: Record<Dimension, CanonicalUnit> = {
  mass: "g",
  volume: "ml",
  count: "count",
};

export function dimensionOf(unit: string): Dimension | null {
  return FACTORS[unit.toLowerCase()]?.dimension ?? null;
}

export type ConversionResult =
  | { ok: true; quantity: number }
  | { ok: false; reason: "unknown-unit" | "dimension-mismatch" };

/**
 * Converts a recipe-line quantity into an item's canonical unit.
 * Cross-dimension conversion (g<->ml) is deliberately refused - it would need
 * per-ingredient density data we don't maintain. Callers surface the failure
 * for manual handling rather than silently corrupting stock counts.
 */
export function toCanonical(
  quantity: number,
  unit: string,
  targetDimension: Dimension,
): ConversionResult {
  const entry = FACTORS[unit.toLowerCase()];
  if (!entry) return { ok: false, reason: "unknown-unit" };
  if (entry.dimension !== targetDimension) {
    return { ok: false, reason: "dimension-mismatch" };
  }

  const converted = quantity * entry.toCanonical;

  // Counts are whole things. Scaling a 1-onion recipe down to 0.4 of a serving
  // still costs you a whole onion, so round up rather than leaving fractional
  // counts in stock. Mass and volume scale continuously and are left alone.
  return {
    ok: true,
    quantity: targetDimension === "count" ? Math.ceil(converted) : converted,
  };
}

/**
 * How much of a stock item a recipe line asks for, trying the package size when
 * the written unit can't reach the item's dimension.
 *
 * "1 tin" is a count, so against a pantry that counts tins it converts
 * directly. Against one that weighs tomatoes in grams it doesn't - and that's
 * what pack_size is for: one tin is 400g, so the line resolves to 400g rather
 * than being flagged as unconvertible. The written unit is always tried first,
 * so nothing changes for the ordinary case where there is no package at all.
 */
export function resolveAmount(
  quantity: number,
  unit: string,
  pack: { size: number | null; unit: string | null },
  targetDimension: Dimension,
): ConversionResult {
  const direct = toCanonical(quantity, unit, targetDimension);
  if (direct.ok) return direct;

  if (pack.size && pack.unit) {
    const viaPack = toCanonical(quantity * pack.size, pack.unit, targetDimension);
    if (viaPack.ok) return viaPack;
  }

  return direct;
}

/** "1 tin (400g)", or just "200g" when there's no package to mention. */
export function describeAmount(
  quantity: number,
  unit: string,
  pack: { size: number | null; unit: string | null },
): string {
  const head = `${formatQuantity(quantity)}${unit === "count" ? "" : ` ${unit}`}`;
  if (!pack.size || !pack.unit) return head;

  const total = quantity * pack.size;
  return `${head} (${formatQuantity(total)}${pack.unit === "count" ? "" : pack.unit})`;
}

/**
 * Scales a base-servings quantity to the chosen serving count.
 * Display and decrement only - scaled values are never written back.
 */
export function scaleQuantity(
  quantity: number,
  baseServings: number,
  chosenServings: number,
): number {
  if (baseServings <= 0) return quantity;
  return (quantity * chosenServings) / baseServings;
}

/** Trims float noise for display: 12.500000001 -> "12.5", 3 -> "3". */
export function formatQuantity(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * The units you're allowed to type, grouped by dimension. Derived from FACTORS
 * rather than listed again, so adding a conversion can't leave the pickers -
 * or the importer's legal-units table - quietly out of date.
 */
export const UNITS_BY_DIMENSION: Record<Dimension, string[]> = Object.entries(
  FACTORS,
).reduce(
  (grouped, [unit, { dimension }]) => {
    grouped[dimension].push(unit);
    return grouped;
  },
  { mass: [], volume: [], count: [] } as Record<Dimension, string[]>,
);

/**
 * Units that name a container rather than an amount. These are the ones worth
 * asking "how much is in one?" about.
 */
export const PACKAGE_UNITS = ["tin", "pack", "jar", "count"];

/** Every legal entry unit, in the order FACTORS declares them. */
export const ENTRY_UNITS = Object.keys(FACTORS);

/**
 * How much one tap of +/- moves an item. Grams and millilitres are too fine to
 * step one at a time; counts are whole things and step by one.
 */
export const ADJUST_STEP: Record<Dimension, number> = {
  mass: 100,
  volume: 100,
  count: 1,
};

/**
 * What to print after a number, spaced the way the unit is said.
 *
 * "500ml" and "1 pack", not "500 ml" and "1pack". Symbols hug the number
 * because that is how they are written on a packet; words are words and need
 * the space. Counts print nothing at all - "6 eggs" is the row's name doing
 * that job.
 */
const SYMBOL_UNITS = new Set(["g", "kg", "ml", "l"]);

export function unitSuffix(unit: string | null | undefined): string {
  if (!unit || unit === "count") return "";
  return SYMBOL_UNITS.has(unit) ? unit : ` ${unit}`;
}
