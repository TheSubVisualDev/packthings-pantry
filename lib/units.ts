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

/**
 * The unit for a line nobody measured: "salt, to taste", "a few sprigs of
 * thyme", "oil for frying".
 *
 * Deliberately not in FACTORS. It has no dimension because there is no amount
 * to have one - it is the absence of a measurement, written down on purpose
 * rather than left blank. Somebody transcribing a family recipe has never
 * weighed the salt and should not have to invent a number to write the recipe
 * down; a recipe that forces one is a recipe they will not finish typing.
 *
 * Every conversion refuses it with its own reason, so the five places that
 * convert a recipe line cannot mistake it for a broken unit and flag it.
 */
export const UNMEASURED = "some";

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
  | { ok: false; reason: "unknown-unit" | "dimension-mismatch" | "unmeasured" };

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
  // Refused with its own reason rather than as an unknown unit: callers treat
  // the two completely differently. An unknown unit is a mistake to report; an
  // unmeasured line is a decision to respect, and gets skipped quietly.
  if (unit.toLowerCase() === UNMEASURED) return { ok: false, reason: "unmeasured" };

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
  // Nothing a package size can do for a line that has no amount.
  if (!direct.ok && direct.reason === "unmeasured") return direct;

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
 * What a recipe line may be measured in - every entry unit, plus the one that
 * says it was not measured. Stock has no equivalent: a shelf either holds an
 * amount or is flagged `unspecified`, which is a column rather than a unit.
 */
export const RECIPE_UNITS = [...ENTRY_UNITS, UNMEASURED];

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

/**
 * Units that are things rather than measures, and so are counted in the
 * plural. "2 tins", not "2 tin" - a recipe that says the latter reads like a
 * form field, which is exactly what a tester said it read like.
 */
const COUNTABLE_UNITS = new Set(["tin", "pack", "jar"]);

/** "1 tin", "2 tins", "100g", "2" - a number with its unit said properly. */
export function sayAmount(quantity: number, unit: string): string {
  const number = formatQuantity(quantity);
  if (!unit || unit === "count") return number;
  if (SYMBOL_UNITS.has(unit)) return `${number}${unit}`;
  if (COUNTABLE_UNITS.has(unit) && quantity !== 1) return `${number} ${unit}s`;
  return `${number} ${unit}`;
}

/**
 * An ingredient line split into the two things it says.
 *
 * The primary is what you measure with - "2 tins", "100g", "1". The secondary
 * is what that comes to when the unit is a package, which is the number you
 * want when you are standing at the shelf rather than at the hob.
 *
 * They were one string, "2 (600g)", printed under a bold ingredient name. A
 * tester read the whole second line as small grey fine print and missed the
 * amount entirely, so the amount now leads the line with the name, and the
 * package size and the preparation note share the quieter one below it.
 */
export function splitAmount(
  quantity: number,
  unit: string,
  pack: { size: number | null; unit: string | null },
  approx = false,
): { primary: string; secondary: string | null } {
  // An unmeasured line has no number to say - "salt, to taste" is the whole
  // amount. Handled here so every screen that prints an amount gets it right
  // rather than each one remembering to check.
  if (unit === UNMEASURED) return { primary: "", secondary: null };

  const primary = `${approx ? "~" : ""}${sayAmount(quantity, unit)}`;
  if (!pack.size || !pack.unit) return { primary, secondary: null };

  return {
    primary,
    secondary: `${approx ? "~" : ""}${sayAmount(quantity * pack.size, pack.unit)}`,
  };
}

/**
 * One ingredient, said the way a step chip should say it: "2 tins Chopped
 * tomato", "~70g Brown Onion", "Salt".
 *
 * The step chips on the cook screen and the ones on the recipe page built this
 * string separately, and neither knew what to do with a line nobody measured -
 * both would have printed "1 some Salt". One definition, and the unmeasured
 * case simply has no amount to print.
 */
export function describeLine(
  quantity: number,
  unit: string,
  pack: { size: number | null; unit: string | null },
  name: string,
  approx = false,
): string {
  const { primary } = splitAmount(quantity, unit, pack, approx);
  return primary ? `${primary} ${name}` : name;
}

/**
 * What somebody typed in a quantity box, which may carry a tilde.
 *
 * "~70" is how a person writes "one medium onion, and I have never weighed
 * one". The tilde lives in the box rather than in a checkbox beside it because
 * that is where a tester reached for it, and because a recipe writer thinking
 * "about 70 grams" is thinking about the number, not about a flag.
 *
 * Returns a null quantity for anything that is not a number, which the caller
 * reports - the parser has one message for that and it is a better one.
 */
export function readQuantity(text: string): {
  quantity: number | null;
  approx: boolean;
} {
  const trimmed = text.trim();
  const approx = trimmed.startsWith("~");
  const rest = (approx ? trimmed.slice(1) : trimmed).trim();
  if (!rest) return { quantity: null, approx };

  const value = Number(rest);
  return {
    quantity: Number.isFinite(value) && value > 0 ? value : null,
    approx,
  };
}

/** The inverse: a stored quantity as the box should show it. */
export function writeQuantity(quantity: number, approx: boolean): string {
  return `${approx ? "~" : ""}${formatQuantity(quantity)}`;
}
