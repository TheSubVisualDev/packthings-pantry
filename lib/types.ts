export type Dimension = "mass" | "volume" | "count";
export type CanonicalUnit = "g" | "ml" | "count";

export interface Item {
  id: number;
  name: string;
  quantity: number;
  canonical_unit: CanonicalUnit;
  dimension: Dimension;
  category: string | null;
  location: string | null;
  expiry_date: string | null;
  updated_at: string | null;
}

export interface Recipe {
  id: number;
  name: string;
  base_servings: number;
  rating: number | null;
  times_cooked: number;
  notes: string | null;
}

export interface RecipeIngredient {
  id: number;
  recipe_id: number;
  item_name: string;
  quantity: number;
  unit: string;
}

export interface RecipeWithIngredients extends Recipe {
  ingredients: RecipeIngredient[];
}

/**
 * One ingredient line's effect on stock, in the item's canonical unit.
 * `delta` is what actually left stock, which is not always what the recipe
 * asked for - a line short on stock takes what's there.
 */
export interface CookChange {
  item_id: number;
  delta: number;
  unit: string;
}

export interface CookEvent {
  id: number;
  recipe_id: number;
  servings: number;
  cooked_at: string;
  undone_at: string | null;
  /** JSON-encoded CookChange[]. */
  changes: string;
}
