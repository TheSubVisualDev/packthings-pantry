export type Dimension = "mass" | "volume" | "count";
export type CanonicalUnit = "g" | "ml" | "count";

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
  photo_url: string | null;
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
  /** "1 tin (400 g)": what one `unit` is worth, when it's a package. */
  pack_size: number | null;
  pack_unit: string | null;
  note: string | null;
  optional: number;
  /** "about this much" - the ~ in "~70g". Display only; it still decrements. */
  approx: number;
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
  photo_url: string | null;
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
  /** JSON-encoded string[] of lines left out, or null when none were. */
  skipped: string | null;
}
