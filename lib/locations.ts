/**
 * Where a thing lives in the kitchen.
 *
 * These are only the defaults a new kitchen starts with. The real list lives in
 * kitchen_locations, per kitchen, because not every home has a spice rack and
 * some have a garage freezer - see getLocations in lib/kitchens.ts.
 */
export const DEFAULT_LOCATIONS = [
  "Fridge",
  "Freezer",
  "Cupboard",
  "Spice rack",
  "Counter",
] as const;

export const UNPLACED = "Unplaced";

/**
 * Items store their location as free text rather than a foreign key, so
 * renaming a place doesn't rewrite history - a jar still says where it was
 * put. This checks a submitted value against the kitchen's current list.
 */
export function isKnownLocation(value: string | null, known: string[]): boolean {
  return value !== null && known.includes(value);
}
