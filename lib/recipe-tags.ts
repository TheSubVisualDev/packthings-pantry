import { getDb } from "./db";
import type { Recipe, RecipeIngredient, RecipeStep } from "./types";

/**
 * Tags on recipes, of two kinds that are kept firmly apart.
 *
 * **Typed tags** are somebody's opinion - "Asian", "Comfort", "Sam likes this".
 * They live in the database, scoped to whoever wrote the recipe.
 *
 * **Derived tags** are facts about the recipe, computed here and stored
 * nowhere: how long it takes, how many things go in it, whether the oven is
 * involved. Never stored, because a "quick" written into a row goes stale the
 * moment somebody changes the timings and a computed one cannot. They are also
 * the tags people actually filter by, which is the argument for making them
 * free rather than asking anybody to maintain them.
 *
 * Shown in different weights so they read as what they are. An opinion and a
 * measurement looking identical is how you end up trusting the wrong one.
 */

export interface RecipeTag {
  id: number;
  owner_id: number;
  name: string;
}

export interface RecipeTagInUse extends RecipeTag {
  recipe_count: number;
}

export const MAX_TAG_LENGTH = 40;

/** Same rules as item tags: collapsed and trimmed, case left as typed. */
export function cleanTagName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_TAG_LENGTH);
}

/**
 * How long the whole thing takes, when it says.
 *
 * Null rather than zero when neither timing is filled in: "no idea" and
 * "instant" are different answers and a recipe with no timings must not sort
 * as the quickest thing you own.
 */
export function totalMinutes(
  recipe: Pick<Recipe, "prep_minutes" | "cook_minutes">,
): number | null {
  const prep = recipe.prep_minutes ?? 0;
  const cook = recipe.cook_minutes ?? 0;
  if (recipe.prep_minutes === null && recipe.cook_minutes === null) return null;
  return prep + cook;
}

/**
 * The time buckets, tightest first.
 *
 * A recipe gets the tightest one it fits, so a twelve minute dish reads "20
 * mins" - a promise about the upper bound rather than a measurement. Filtering
 * by time compares the minutes themselves rather than these labels, so asking
 * for half an hour still finds the twelve minute one.
 */
const TIME_BUCKETS: { upTo: number; label: string }[] = [
  { upTo: 10, label: "10 mins" },
  { upTo: 20, label: "20 mins" },
  { upTo: 30, label: "30 mins" },
  { upTo: 45, label: "45 mins" },
  { upTo: 90, label: "90 mins" },
];

/** Words that mean the oven or the grill is on. */
const OVEN_WORDS =
  /\b(oven|bake[ds]?|baking|roast(ed|ing)?|grill(ed|ing)?|broil(ed|ing)?|preheat(ed)?|gas mark)\b/i;

/** At or under this many lines is worth saying out loud. */
const FEW_INGREDIENTS = 5;

/** From this many servings up, it is a batch rather than a dinner. */
const BATCH_SERVINGS = 6;

export interface DerivedTag {
  label: string;
  /** Why it is true, for a tooltip and for the check script. */
  because: string;
  /**
   * Which derivation produced it.
   *
   * So a caller can leave one out without matching on the words. A listing
   * card prints the real time already, and a "90 mins" bucket chip next to
   * "50 min" reads as the app contradicting itself.
   */
  kind: "time" | "few-ingredients" | "no-oven" | "batch";
}

/**
 * What the recipe says about itself.
 *
 * Every one of these is checkable against the row, which is the whole point:
 * no derivation may depend on reading the prose and guessing. Anything that
 * would need judgement belongs in a typed tag, where a person takes
 * responsibility for it.
 */
export function derivedTags(
  recipe: Pick<Recipe, "prep_minutes" | "cook_minutes" | "base_servings">,
  ingredients: Pick<RecipeIngredient, "optional">[],
  steps: Pick<RecipeStep, "body">[],
): DerivedTag[] {
  const tags: DerivedTag[] = [];

  const minutes = totalMinutes(recipe);
  if (minutes !== null) {
    const bucket = TIME_BUCKETS.find((candidate) => minutes <= candidate.upTo);
    if (bucket) {
      tags.push({
        label: bucket.label,
        because: `${minutes} minutes in total`,
        kind: "time",
      });
    }
  }

  /**
   * Optional lines do not count against you.
   *
   * "Five ingredients" is a claim about what you have to buy, and a garnish you
   * can skip is not something you have to buy.
   */
  const required = ingredients.filter((line) => !line.optional).length;
  if (required > 0 && required <= FEW_INGREDIENTS) {
    tags.push({
      label: `${required} ingredients`,
      because: `${required} lines that are not optional`,
      kind: "few-ingredients",
    });
  }

  /**
   * Said only when there are steps to read.
   *
   * A recipe with no method mentions no oven, and announcing "no oven" about a
   * recipe that has not been written yet is inventing one rather than missing
   * one.
   */
  if (steps.length > 0 && !steps.some((step) => OVEN_WORDS.test(step.body))) {
    tags.push({
      label: "No oven",
      because: "no step mentions the oven or grill",
      kind: "no-oven",
    });
  }

  if (recipe.base_servings >= BATCH_SERVINGS) {
    tags.push({
      label: "Batch",
      because: `makes ${recipe.base_servings}`,
      kind: "batch",
    });
  }

  return tags;
}

/**
 * Ingredients that give a cuisine away.
 *
 * `strong` means one is enough - nobody puts gochujang in a shepherd's pie.
 * `weak` needs two to agree, because ginger alone is in everything from a stir
 * fry to a biscuit. The same bias as the receipt parser and the resolver: miss
 * one rather than invent one, since a wrong suggestion accepted with one tap is
 * worse than no suggestion at all.
 *
 * Deliberately short. This is not a cuisine taxonomy, it is a shortlist of
 * ingredients that are nearly proof, and every entry earns its place by being
 * one somebody would tap "yes" to without thinking.
 */
const CUISINE_MARKERS: { cuisine: string; strong: string[]; weak: string[] }[] = [
  {
    cuisine: "Asian",
    strong: ["gochujang", "doenjang", "miso", "dashi", "mirin", "fish sauce", "kimchi", "sriracha"],
    weak: ["soy sauce", "sesame oil", "rice vinegar", "ginger", "spring onion", "tofu", "noodles"],
  },
  {
    cuisine: "Indian",
    strong: ["garam masala", "asafoetida", "curry leaves", "ghee", "paneer", "tandoori"],
    weak: ["turmeric", "cumin", "coriander", "cardamom", "chickpeas", "lentils"],
  },
  {
    cuisine: "Italian",
    strong: ["parmesan", "pancetta", "ricotta", "mascarpone", "pesto", "risotto rice"],
    weak: ["basil", "oregano", "olive oil", "passata", "mozzarella", "pasta"],
  },
  {
    cuisine: "Mexican",
    strong: ["chipotle", "tortillas", "masa", "tomatillo"],
    weak: ["lime", "coriander", "black beans", "avocado", "cumin"],
  },
  {
    cuisine: "Middle Eastern",
    strong: ["harissa", "tahini", "za'atar", "sumac", "pomegranate molasses"],
    weak: ["chickpeas", "cumin", "parsley", "lemon", "yoghurt"],
  },
];

/**
 * Cuisines the ingredients point at, best evidence first.
 *
 * Proposed, never applied. A suggestion accepted with one tap is the point;
 * a tag applied without being asked is the app deciding it knows what you
 * cooked, which it does not.
 */
export function suggestCuisines(
  ingredients: Pick<RecipeIngredient, "item_name">[],
): string[] {
  /**
   * Whole words only, which is why every name is padded with spaces.
   *
   * A bare substring test had "garam masala" suggesting Mexican, because
   * "masa" is inside "masala". generic-nutrition learned the same lesson -
   * "Cornflour" is not flour there for the same reason.
   */
  const haystack = ingredients
    .map((line) => ` ${line.item_name.toLowerCase().replace(/[^a-z0-9'\s]/g, " ")} `)
    .join(" ");
  const has = (marker: string) => haystack.includes(` ${marker.toLowerCase()} `);

  return CUISINE_MARKERS.map(({ cuisine, strong, weak }) => {
    const strongHits = strong.filter(has).length;
    const weakHits = weak.filter(has).length;
    // One near-proof, or two things that only agree together.
    const convinced = strongHits >= 1 || weakHits >= 2;
    return { cuisine, score: strongHits * 2 + weakHits, convinced };
  })
    .filter((candidate) => candidate.convinced)
    .sort((a, b) => b.score - a.score)
    .map((candidate) => candidate.cuisine);
}

/* ---------- typed tags ---------- */

/** Every tag this person uses, most used first - which is also the pick order. */
export async function getRecipeTags(ownerId: number): Promise<RecipeTagInUse[]> {
  const result = await getDb().execute({
    sql: `SELECT t.id, t.owner_id, t.name,
            (SELECT COUNT(*) FROM recipe_tag_links l WHERE l.tag_id = t.id) AS recipe_count
          FROM recipe_tags t
          WHERE t.owner_id = ?
          ORDER BY recipe_count DESC, t.name COLLATE NOCASE`,
    args: [ownerId],
  });
  return result.rows as unknown as RecipeTagInUse[];
}

/**
 * Every recipe's tags, as one query rather than one per recipe.
 *
 * A listing of forty recipes would otherwise be forty round trips to
 * Nuremberg, which is the same reason getTagsByItem exists.
 */
export async function getTagsByRecipe(
  recipeIds: readonly number[],
): Promise<Map<number, RecipeTag[]>> {
  const byRecipe = new Map<number, RecipeTag[]>();
  if (recipeIds.length === 0) return byRecipe;

  const placeholders = recipeIds.map(() => "?").join(",");
  const result = await getDb().execute({
    sql: `SELECT l.recipe_id, t.id, t.owner_id, t.name
          FROM recipe_tag_links l
          JOIN recipe_tags t ON t.id = l.tag_id
          WHERE l.recipe_id IN (${placeholders})
          ORDER BY t.name COLLATE NOCASE`,
    args: [...recipeIds],
  });

  for (const row of result.rows as unknown as (RecipeTag & { recipe_id: number })[]) {
    const tag = { id: row.id, owner_id: row.owner_id, name: row.name };
    const bucket = byRecipe.get(row.recipe_id);
    if (bucket) bucket.push(tag);
    else byRecipe.set(row.recipe_id, [tag]);
  }
  return byRecipe;
}

/** Finds a tag by name, creating it if this person has not used it before. */
export async function ensureRecipeTag(
  ownerId: number,
  rawName: string,
): Promise<RecipeTag | null> {
  const name = cleanTagName(rawName);
  if (!name) return null;

  const db = getDb();
  // INSERT OR IGNORE then SELECT: the unique index decides, so two writers
  // filing the same new tag at once end up with one tag rather than an error.
  await db.execute({
    sql: "INSERT OR IGNORE INTO recipe_tags (owner_id, name) VALUES (?, ?)",
    args: [ownerId, name],
  });
  const found = await db.execute({
    sql: "SELECT id, owner_id, name FROM recipe_tags WHERE owner_id = ? AND LOWER(name) = LOWER(?)",
    args: [ownerId, name],
  });
  return (found.rows[0] as unknown as RecipeTag) ?? null;
}

export async function tagRecipe(
  ownerId: number,
  recipeId: number,
  rawName: string,
): Promise<RecipeTag | null> {
  const tag = await ensureRecipeTag(ownerId, rawName);
  if (!tag) return null;

  await getDb().execute({
    // The author is in the WHERE clause, so a recipe id from somebody else's
    // collection matches nothing - the rule the rest of the writes follow.
    sql: `INSERT OR IGNORE INTO recipe_tag_links (recipe_id, tag_id)
          SELECT ?, ? WHERE EXISTS (
            SELECT 1 FROM recipes WHERE id = ? AND author_id = ?
          )`,
    args: [recipeId, tag.id, recipeId, ownerId],
  });
  return tag;
}

export async function untagRecipe(
  ownerId: number,
  recipeId: number,
  tagId: number,
): Promise<void> {
  await getDb().execute({
    sql: `DELETE FROM recipe_tag_links
          WHERE recipe_id = ? AND tag_id = ?
            AND EXISTS (SELECT 1 FROM recipes WHERE id = ? AND author_id = ?)`,
    args: [recipeId, tagId, recipeId, ownerId],
  });
}

/**
 * Copies one person's tags onto another person's fork.
 *
 * By name, not by id: the words carry over into the forker's own vocabulary,
 * so "Asian" on their copy is their tag and renaming it later does not reach
 * back into somebody else's collection.
 */
export async function copyTagsOnFork(
  fromRecipeId: number,
  toRecipeId: number,
  newOwnerId: number,
): Promise<number> {
  const result = await getDb().execute({
    sql: `SELECT t.name FROM recipe_tag_links l
          JOIN recipe_tags t ON t.id = l.tag_id
          WHERE l.recipe_id = ?`,
    args: [fromRecipeId],
  });

  let copied = 0;
  for (const row of result.rows as unknown as { name: string }[]) {
    if (await tagRecipe(newOwnerId, toRecipeId, row.name)) copied += 1;
  }
  return copied;
}
