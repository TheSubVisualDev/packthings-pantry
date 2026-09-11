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
  /** Null only for recipes written before authorship existed. */
  author_id: number | null;
  visibility: "private" | "friends" | "public";
  forked_from_id: number | null;
  name: string;
  description: string | null;
  base_servings: number;
  prep_minutes: number | null;
  cook_minutes: number | null;
  source: string | null;
  rating: number | null;
  times_cooked: number;
  notes: string | null;
  updated_at: string | null;
}

export interface RecipeIngredient {
  id: number;
  recipe_id: number;
  /** Null when the recipe asks for something the pantry has never held. */
  item_id: number | null;
  item_name: string;
  quantity: number;
  unit: string;
  note: string | null;
  optional: number;
  section: string | null;
  position: number;
}

export interface RecipeStep {
  id: number;
  recipe_id: number;
  position: number;
  section: string | null;
  body: string;
  minutes: number | null;
}

/** A step with the ingredient lines it draws on, for the cooking view. */
export interface RecipeStepWithIngredients extends RecipeStep {
  uses: RecipeIngredient[];
}

/** A recipe row carrying who wrote it, for lists and bylines. */
export interface RecipeWithAuthor extends Recipe {
  author_handle: string | null;
  author_name: string | null;
  /** Averaged across everyone who rated it, not one shared number. */
  avg_rating: number | null;
  rating_count: number;
}

export interface RecipeWithIngredients extends Recipe {
  ingredients: RecipeIngredient[];
  steps: RecipeStepWithIngredients[];
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
