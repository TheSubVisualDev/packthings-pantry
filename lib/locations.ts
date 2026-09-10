/**
 * Where a thing lives in the kitchen. Hardcoded rather than user-maintained,
 * same as the unit conversion factors - this is code, not data.
 */
export const LOCATIONS = [
  "Fridge",
  "Freezer",
  "Cupboard",
  "Spice rack",
  "Counter",
] as const;

export type Location = (typeof LOCATIONS)[number];

export const UNPLACED = "Unplaced";

export function isLocation(value: string | null): value is Location {
  return value !== null && (LOCATIONS as readonly string[]).includes(value);
}
