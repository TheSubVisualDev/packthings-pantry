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
  // count has no conversion
  count: { dimension: "count", toCanonical: 1 },
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
  return { ok: true, quantity: quantity * entry.toCanonical };
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
