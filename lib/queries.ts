import { getDb, plainRows } from "./db";
import { totalMinutes } from "./recipe-tags";
import type { PlanningFacts } from "./plan";
import { VISIBLE_TO_VIEWER, viewerArgs } from "./social";
import type {
  Recipe,
  RecipeWithAuthor,
  RecipeIngredient,
  RecipeStep,
  RecipeStepWithIngredients,
  RecipeWithIngredients,
} from "./types";


/**
 * The columns every recipe listing wants: the row, who wrote it, and what
 * people made of it. Ratings are averaged across everyone rather than being one
 * shared number, which is what having more than one household requires.
 */
const RECIPE_WITH_AUTHOR = `
  SELECT r.*, u.handle AS author_handle, u.display_name AS author_name,
         (SELECT ROUND(AVG(rating), 1) FROM recipe_ratings WHERE recipe_id = r.id) AS avg_rating,
         (SELECT COUNT(*) FROM recipe_ratings WHERE recipe_id = r.id) AS rating_count
  FROM recipes r
  LEFT JOIN users u ON u.id = r.author_id
`;

/**
 * Your own collection: everything you wrote.
 *
 * `term` searches within it, by name, blurb or ingredient. No visibility clause
 * here: these are yours, and you can always see your own.
 */
export async function getMyRecipes(
  authorId: number,
  term = "",
): Promise<RecipeWithAuthor[]> {
  const needle = `%${term.trim().toLowerCase()}%`;
  const filtered = term.trim().length > 0;

  const result = await getDb().execute({
    sql: `${RECIPE_WITH_AUTHOR}
          WHERE r.author_id = ?
          ${
            filtered
              ? `AND (
                  LOWER(r.name) LIKE ?
                  OR LOWER(COALESCE(r.description, '')) LIKE ?
                  OR EXISTS (
                    SELECT 1 FROM recipe_ingredients ri
                    WHERE ri.recipe_id = r.id AND LOWER(ri.item_name) LIKE ?
                  )
                )`
              : ""
          }
          ORDER BY r.times_cooked DESC, r.name`,
    args: filtered ? [authorId, needle, needle, needle] : [authorId],
  });
  return plainRows<RecipeWithAuthor>(result);
}

/**
 * Recipes you have saved off somebody else, newest save first.
 *
 * Saving and adopting are different acts and have always been stored
 * separately - a like is "I want to find this again", adopting is "this is a
 * thing my kitchen cooks" - but nothing has ever shown the first one back to
 * you, so the star was a write-only button. Your own recipes are left out:
 * they are in the tab called Wrote, and a recipe cannot be saved from
 * yourself.
 *
 * The visibility clause still applies. Somebody can make a recipe private
 * after you saved it, and a save is not a way around that.
 */
export async function getSavedRecipes(
  viewerId: number,
  term = "",
): Promise<RecipeWithAuthor[]> {
  const needle = `%${term.trim().toLowerCase()}%`;
  const filtered = term.trim().length > 0;

  const result = await getDb().execute({
    sql: `${RECIPE_WITH_AUTHOR}
          JOIN recipe_likes rl ON rl.recipe_id = r.id AND rl.user_id = ?
          WHERE r.author_id <> ?
            AND ${VISIBLE_TO_VIEWER}
          ${
            filtered
              ? `AND (
                  LOWER(r.name) LIKE ?
                  OR LOWER(COALESCE(r.description, '')) LIKE ?
                  OR EXISTS (
                    SELECT 1 FROM recipe_ingredients ri
                    WHERE ri.recipe_id = r.id AND LOWER(ri.item_name) LIKE ?
                  )
                )`
              : ""
          }
          ORDER BY rl.created_at DESC, r.name`,
    args: filtered
      ? [viewerId, viewerId, ...viewerArgs(viewerId), needle, needle, needle]
      : [viewerId, viewerId, ...viewerArgs(viewerId)],
  });
  return plainRows<RecipeWithAuthor>(result);
}

/**
 * Everything a person is allowed to see, newest first - the discover page.
 *
 * The visibility rule is in the WHERE clause rather than filtered afterwards,
 * so there is no version of this query that forgets it.
 */
export async function browseRecipes(
  viewerId: number,
  options: { authorId?: number; limit?: number } = {},
): Promise<RecipeWithAuthor[]> {
  const byAuthor = options.authorId ? "AND r.author_id = ?" : "";

  const result = await getDb().execute({
    sql: `${RECIPE_WITH_AUTHOR}
          WHERE ${VISIBLE_TO_VIEWER} ${byAuthor}
          ORDER BY r.id DESC
          LIMIT ?`,
    args: [
      ...viewerArgs(viewerId),
      ...(options.authorId ? [options.authorId] : []),
      options.limit ?? 60,
    ],
  });
  return plainRows<RecipeWithAuthor>(result);
}

/**
 * Just who wrote a recipe, with no visibility check.
 *
 * Attribution is a credit, not access. "Adapted from @someone" has to keep
 * working after they make the original private, or taking your copy private
 * would quietly erase the person you got it from.
 */
export async function getRecipeAuthorHandle(
  recipeId: number,
): Promise<{ id: number; handle: string } | null> {
  const result = await getDb().execute({
    sql: `SELECT u.id, u.handle FROM recipes r
          JOIN users u ON u.id = r.author_id
          WHERE r.id = ?`,
    args: [recipeId],
  });
  return (result.rows[0] as unknown as { id: number; handle: string }) ?? null;
}

/**
 * Every ingredient name used across the recipes you wrote, for the editor to
 * suggest. It suggested the kitchen's stock names until v2 dropped stock (18
 * Oct 2026); what you have called a thing before does the same job - one
 * spelling of "spring onions" instead of three.
 */
export async function getIngredientNames(authorId: number): Promise<string[]> {
  const result = await getDb().execute({
    sql: `SELECT DISTINCT ri.item_name
          FROM recipe_ingredients ri
          JOIN recipes r ON r.id = ri.recipe_id
          WHERE r.author_id = ?
          ORDER BY ri.item_name COLLATE NOCASE
          LIMIT 1000`,
    args: [authorId],
  });
  return (result.rows as unknown as { item_name: string }[]).map((row) => row.item_name);
}

/** Kept for the API, which lists what the calling account wrote. */
export async function getRecipes(authorId: number): Promise<Recipe[]> {
  return getMyRecipes(authorId);
}

export async function getRecipe(
  id: number,
  viewerId: number,
): Promise<RecipeWithIngredients | null> {
  // Four reads rather than one join: the join would multiply every ingredient
  // by every step that mentions it, and stitching the rows back apart in JS is
  // more code than fetching them separately.
  const [recipeResult, ingredientResult, stepResult, linkResult] = await Promise.all([
    getDb().execute({
      sql: `SELECT r.* FROM recipes r WHERE r.id = ? AND ${VISIBLE_TO_VIEWER}`,
      args: [id, ...viewerArgs(viewerId)],
    }),
    getDb().execute({
      sql: "SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY position, id",
      args: [id],
    }),
    getDb().execute({
      sql: "SELECT * FROM recipe_steps WHERE recipe_id = ? ORDER BY position, id",
      args: [id],
    }),
    getDb().execute({
      sql: `SELECT si.step_id, si.ingredient_id
            FROM recipe_step_ingredients si
            JOIN recipe_steps s ON s.id = si.step_id
            WHERE s.recipe_id = ?`,
      args: [id],
    }),
  ]);

  const recipe = recipeResult.rows[0] as unknown as Recipe | undefined;
  if (!recipe) return null;

  const ingredients = ingredientResult.rows as unknown as RecipeIngredient[];
  const byId = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));

  const usesByStep = new Map<number, RecipeIngredient[]>();
  for (const row of linkResult.rows as unknown as {
    step_id: number;
    ingredient_id: number;
  }[]) {
    const ingredient = byId.get(row.ingredient_id);
    if (!ingredient) continue;

    const bucket = usesByStep.get(row.step_id);
    if (bucket) bucket.push(ingredient);
    else usesByStep.set(row.step_id, [ingredient]);
  }

  const steps: RecipeStepWithIngredients[] = (
    stepResult.rows as unknown as RecipeStep[]
  ).map((step) => ({
    ...step,
    uses: (usesByStep.get(step.id) ?? []).sort((a, b) => a.position - b.position),
  }));

  return { ...recipe, ingredients, steps };
}

/**
 * Recipes in this kitchen's cookbook, newest adoption first.
 *
 * The visibility clause still applies: somebody can make a recipe private
 * after you adopted it, and the cookbook is not a way around that. The row
 * stays, so it comes back if they change their mind.
 */
export async function getCookbookRecipes(
  kitchenId: number | null,
  viewerId: number,
  /** Searches within it, by name, blurb or ingredient, as getMyRecipes does. */
  term = "",
): Promise<RecipeWithAuthor[]> {
  if (kitchenId === null) return [];

  const needle = `%${term.trim().toLowerCase()}%`;
  const filtered = term.trim().length > 0;

  const result = await getDb().execute({
    sql: `${RECIPE_WITH_AUTHOR}
          JOIN cookbook cb ON cb.recipe_id = r.id AND cb.kitchen_id = ?
          WHERE ${VISIBLE_TO_VIEWER}
          ${
            filtered
              ? `AND (
                  LOWER(r.name) LIKE ?
                  OR LOWER(COALESCE(r.description, '')) LIKE ?
                  OR EXISTS (
                    SELECT 1 FROM recipe_ingredients ri
                    WHERE ri.recipe_id = r.id AND LOWER(ri.item_name) LIKE ?
                  )
                )`
              : ""
          }
          ORDER BY r.times_cooked DESC, r.name`,
    args: filtered
      ? [kitchenId, ...viewerArgs(viewerId), needle, needle, needle]
      : [kitchenId, ...viewerArgs(viewerId)],
  });
  return plainRows<RecipeWithAuthor>(result);
}

/**
 * Recipes from people you follow, newest first.
 *
 * A one-way follow is enough to see somebody in your feed - following is how
 * you said you wanted to. Mutual is only needed to unlock friends-only
 * recipes, and the visibility clause already handles that.
 */
export async function getFeed(
  viewerId: number,
  limit = 40,
): Promise<RecipeWithAuthor[]> {
  const result = await getDb().execute({
    sql: `${RECIPE_WITH_AUTHOR}
          WHERE ${VISIBLE_TO_VIEWER}
            AND r.author_id <> ?
            AND EXISTS (
              SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.followee_id = r.author_id
            )
          ORDER BY r.id DESC
          LIMIT ?`,
    args: [...viewerArgs(viewerId), viewerId, viewerId, limit],
  });
  return plainRows<RecipeWithAuthor>(result);
}

/**
 * Searches recipes you're allowed to see, by name, blurb or ingredient.
 *
 * LIKE rather than full-text: a pantry holds hundreds of recipes, not millions,
 * and an FTS table is a second thing to keep in step with the first for a
 * gain nobody would notice.
 */
export async function searchRecipes(
  viewerId: number,
  term: string,
  limit = 40,
): Promise<RecipeWithAuthor[]> {
  const needle = `%${term.trim().toLowerCase()}%`;
  if (needle.length <= 2) return [];

  const result = await getDb().execute({
    sql: `${RECIPE_WITH_AUTHOR}
          WHERE ${VISIBLE_TO_VIEWER}
            AND (
              LOWER(r.name) LIKE ?
              OR LOWER(COALESCE(r.description, '')) LIKE ?
              OR EXISTS (
                SELECT 1 FROM recipe_ingredients ri
                WHERE ri.recipe_id = r.id AND LOWER(ri.item_name) LIKE ?
              )
            )
          ORDER BY (LOWER(r.name) LIKE ?) DESC, r.id DESC
          LIMIT ?`,
    args: [...viewerArgs(viewerId), needle, needle, needle, needle, limit],
  });
  return plainRows<RecipeWithAuthor>(result);
}

export interface RecipeSocial {
  likes: number;
  youLiked: boolean;
}

export async function getRecipeSocial(
  recipeId: number,
  viewerId: number,
): Promise<RecipeSocial> {
  const result = await getDb().execute({
    sql: `SELECT
            (SELECT COUNT(*) FROM recipe_likes WHERE recipe_id = ?) AS likes,
            EXISTS (SELECT 1 FROM recipe_likes WHERE recipe_id = ? AND user_id = ?) AS you_liked`,
    args: [recipeId, recipeId, viewerId],
  });

  const row = result.rows[0] as unknown as { likes: number; you_liked: number };
  return { likes: row.likes, youLiked: row.you_liked === 1 };
}

export interface Comment {
  id: number;
  body: string;
  created_at: string | null;
  user_id: number;
  handle: string;
  display_name: string;
  avatar_url: string | null;
}

/** Comments from people you haven't blocked, and who haven't blocked you. */
export async function getComments(
  recipeId: number,
  viewerId: number,
): Promise<Comment[]> {
  const result = await getDb().execute({
    sql: `SELECT c.id, c.body, c.created_at, c.user_id, u.handle, u.display_name, u.avatar_url
          FROM recipe_comments c
          JOIN users u ON u.id = c.user_id
          WHERE c.recipe_id = ?
            AND NOT EXISTS (
              SELECT 1 FROM blocks b
              WHERE (b.blocker_id = c.user_id AND b.blocked_id = ?)
                 OR (b.blocker_id = ? AND b.blocked_id = c.user_id)
            )
          ORDER BY c.created_at, c.id`,
    args: [recipeId, viewerId, viewerId],
  });
  // Plain objects: these reach a client component, and a libSQL Row does not
  // survive that boundary quietly. See plainRows in lib/db.ts.
  return plainRows<Comment>(result);
}

export async function searchPeople(viewerId: number, term: string) {
  const needle = `%${term.trim().toLowerCase()}%`;
  if (needle.length <= 2) return [];

  const result = await getDb().execute({
    sql: `SELECT u.id, u.handle, u.display_name, u.avatar_url
          FROM users u
          WHERE u.id <> ?
            AND (LOWER(u.handle) LIKE ? OR LOWER(u.display_name) LIKE ?)
            AND NOT EXISTS (
              SELECT 1 FROM blocks b
              WHERE (b.blocker_id = u.id AND b.blocked_id = ?)
                 OR (b.blocker_id = ? AND b.blocked_id = u.id)
            )
          ORDER BY u.handle
          LIMIT 10`,
    args: [viewerId, needle, needle, viewerId, viewerId],
  });
  return result.rows as unknown as {
    id: number;
    handle: string;
    display_name: string;
    avatar_url: string | null;
  }[];
}

export interface CookedEntry {
  id: number;
  recipe_id: number;
  recipe_name: string;
  servings: number;
  cooked_at: string;
  cooked_by_handle: string | null;
  cooked_by_name: string | null;
  /** Lines the cook said they did not use. Empty for an ordinary cook. */
  skipped: string[];
  /**
   * Whether undo is still offered for this one, decided by the database.
   *
   * A day. Undo is for the press that was a mistake - the wrong recipe, the
   * same dinner logged twice - and that is noticed the same night or the
   * morning after. It used to be a day because it put stock back, and a shelf
   * a fortnight on is not the shelf things came off; with no stock (v2) the
   * limit stays for the other reason, that a log anybody can quietly rewrite
   * weeks later is not a record of what happened.
   *
   * Decided in SQL rather than from the browser's clock, because the two
   * disagree and a button that appears on one device and not another is worse
   * than no button.
   */
  undoable: boolean;
}

/**
 * What this kitchen has cooked, most recent first.
 *
 * Names and days, which is what was asked for - no heatmap. The data behind it
 * is richer than that, and stored rather than summarised, so a fuller view
 * later needs a query and not a migration.
 *
 * Undone cooks are excluded rather than struck through: undoing one means it
 * did not happen, and a log that shows things that did not happen is not a log.
 */
export async function getCookedLog(
  kitchenId: number | null,
  limit = 60,
  /** Just this recipe, for the history on its own page. */
  recipeId?: number,
): Promise<CookedEntry[]> {
  if (kitchenId === null) return [];

  const result = await getDb().execute({
    sql: `SELECT c.id, c.recipe_id, r.name AS recipe_name, c.servings, c.cooked_at,
                 u.handle AS cooked_by_handle, u.display_name AS cooked_by_name,
                 c.skipped,
                 c.cooked_at > datetime('now', '-1 day') AS undoable
          FROM cook_events c
          JOIN recipes r ON r.id = c.recipe_id
          LEFT JOIN users u ON u.id = c.cooked_by
          WHERE c.kitchen_id = ? AND c.undone_at IS NULL
            AND (? IS NULL OR c.recipe_id = ?)
          ORDER BY c.cooked_at DESC, c.id DESC
          LIMIT ?`,
    args: [kitchenId, recipeId ?? null, recipeId ?? null, limit],
  });
  return (
    result.rows as unknown as (Omit<CookedEntry, "skipped" | "undoable"> & {
      skipped: string | null;
      undoable: number;
    })[]
  ).map((row) => ({
    ...row,
    // Parsed here rather than at every reader. A row written before the
    // column existed, and one where nothing was skipped, both read as [].
    skipped: row.skipped ? (JSON.parse(row.skipped) as string[]) : [],
    undoable: row.undoable === 1,
  }));
}

/**
 * Everything the week planner's "Fill the gaps" ranks, in one pass over the
 * cookbook.
 *
 * This was the Tonight ranker's input, and most of it was about the shelves -
 * how much of a recipe was in, what in it was about to go off. v2 has no
 * shelves, so what is left is what the kitchen has said about its own
 * cooking: how it rated a recipe, how often it goes back to it, and how
 * recently it had it. The scoring stays pure in lib/plan.ts, so check:plan
 * can argue with a weight without a database.
 */
export async function getPlanningFacts(
  kitchenId: number | null,
  viewerId: number,
): Promise<PlanningFacts[]> {
  if (kitchenId === null) return [];

  const [recipes, lastCooked] = await Promise.all([
    getCookbookRecipes(kitchenId, viewerId),
    /**
     * When each recipe was last actually cooked here.
     *
     * Undone cooks do not count. Pressing undo is saying it did not happen,
     * and a mistake corrected thirty seconds later must not suppress the
     * recipe for a fortnight.
     */
    getDb().execute({
      sql: `SELECT recipe_id,
                   CAST(julianday('now') - julianday(MAX(cooked_at)) AS INTEGER) AS days_since
            FROM cook_events
            WHERE kitchen_id = ? AND undone_at IS NULL
            GROUP BY recipe_id`,
      args: [kitchenId],
    }),
  ]);

  const sinceByRecipe = new Map(
    (lastCooked.rows as unknown as { recipe_id: number; days_since: number }[]).map(
      (row) => [row.recipe_id, row.days_since],
    ),
  );

  return recipes.map((recipe) => ({
    id: recipe.id,
    name: recipe.name,
    minutes: totalMinutes(recipe),
    rating: recipe.avg_rating,
    timesCooked: recipe.times_cooked,
    daysSinceCooked: sinceByRecipe.get(recipe.id) ?? null,
  }));
}
