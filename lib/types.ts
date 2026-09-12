export type Dimension = "mass" | "volume" | "count";
export type CanonicalUnit = "g" | "ml" | "count";

export interface Item {
  id: number;
  name: string;
  quantity: number;
  canonical_unit: CanonicalUnit;
  dimension: Dimension;
  /**
   * The old free-text category. Superseded by tags and primary_tag_id, kept
   * until the column can be dropped - which needs a table rebuild.
   */
  category: string | null;
  /** Which tag it is filed under, of however many it carries. */
  primary_tag_id: number | null;
  location: string | null;
  /**
   * The old single shop string. Superseded by the shops and item_shops tables
   * and preferred_shop_id, kept until the column can be dropped.
   */
  shop: string | null;
  /** Where you usually buy it, of however many places sell it. */
  preferred_shop_id: number | null;
  expiry_date: string | null;
  /** When it was opened, if it has been. */
  opened_at: string | null;
  /** How long it keeps once opened. */
  shelf_life_days: number | null;

  /**
   * Containers. What one pack holds, and how many unopened ones there are.
   * `quantity` above is what is left in the *open* one, so the total on hand
   * is sealed_count * pack_size + quantity. A null pack_size means the item is
   * just a loose amount and sealed_count is meaningless.
   */
  pack_size: number | null;
  pack_unit: string | null;
  sealed_count: number;
  /** Superseded by restock_target; kept until the columns can be dropped. */
  restock_to: number | null;
  restock_min: number | null;
  /**
   * How much to keep on the shelf, in this item quantity unit - six eggs, not
   * one box. Packs only come into it when buying, where the shortfall rounds up
   * to whole ones. Null means nobody has said.
   */
  restock_target: number | null;
  /**
   * "Some, I do not know how much." quantity carries no meaning when this is
   * set - a recipe line against it simply cannot be deducted, which is the same
   * case as an unmatched line and already handled by the cook flow.
   */
  unspecified: number;
  /**
   * What a count is a count of, singular: "tin", "clove", "egg".
   *
   * canonical_unit says "count" for every one of them, so without this a shelf
   * prints "3" beside "400ml" and only one of the two answers the question.
   * Null is an unqualified count and still prints bare.
   */
  count_noun: string | null;

  /** Per 100g or 100ml, as Open Food Facts reports it. Null until scanned. */
  kcal_100: number | null;
  protein_100: number | null;
  carbs_100: number | null;
  fat_100: number | null;
  fibre_100: number | null;
  salt_100: number | null;
  /**
   * Where those figures came from.
   *
   * "scan" is off the packet via Open Food Facts, "estimate" is a standard
   * figure for that kind of food, "manual" is somebody typing it. Kept because
   * a saved guess is indistinguishable from a measurement without it.
   */
  nutrition_source: "scan" | "estimate" | "manual" | null;

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
