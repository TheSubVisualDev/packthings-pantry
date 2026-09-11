import { getDb } from "./db";
import { VISIBLE_TO_VIEWER, viewerArgs } from "./social";
import type {
  Item,
  Recipe,
  RecipeWithAuthor,
  RecipeIngredient,
  RecipeStep,
  RecipeStepWithIngredients,
  RecipeWithIngredients,
} from "./types";

/** No kitchen means no stock, which is a real state rather than an error. */
export async function getItems(kitchenId: number | null): Promise<Item[]> {
  if (kitchenId === null) return [];

  const result = await getDb().execute({
    sql: "SELECT * FROM items WHERE kitchen_id = ? ORDER BY category NULLS LAST, name",
    args: [kitchenId],
  });
  return result.rows as unknown as Item[];
}

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
 * Your own collection - what the cook-from-stock panel ranks.
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
  return result.rows as unknown as RecipeWithAuthor[];
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
  return result.rows as unknown as RecipeWithAuthor[];
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

/** Item names currently in stock, lowercased, for recipe match indicators. */
export async function getStockedItemNames(
  kitchenId: number | null,
): Promise<Set<string>> {
  if (kitchenId === null) return new Set();

  const result = await getDb().execute({
    // sealed_count as well as quantity: an unopened tin is still in the
    // cupboard, and 'quantity' has meant "what is in the OPEN one" since
    // containers arrived. Without this, three sealed tins read as none.
    sql: "SELECT name FROM items WHERE kitchen_id = ? AND (quantity > 0 OR sealed_count > 0)",
    args: [kitchenId],
  });
  return new Set(
    (result.rows as unknown as { name: string }[]).map((r) => r.name.toLowerCase()),
  );
}

export interface RecipeWithMatch extends RecipeWithAuthor {
  /** Ingredient lines whose item is currently in stock. */
  have: number;
  total: number;
}

/**
 * Recipes ranked for the "cook with what you have" panel, each with a count of
 * how many of its lines are stocked *in this kitchen*. One query for all
 * ingredient lines rather than one per recipe.
 */
export async function getRecipesWithMatches(
  kitchenId: number | null,
  authorId: number,
  term = "",
): Promise<RecipeWithMatch[]> {
  const [recipes, stocked, ingredientRows] = await Promise.all([
    getMyRecipes(authorId, term),
    getStockedItemNames(kitchenId),
    getDb().execute("SELECT recipe_id, item_name FROM recipe_ingredients"),
  ]);

  const byRecipe = new Map<number, string[]>();
  for (const row of ingredientRows.rows as unknown as RecipeIngredient[]) {
    const bucket = byRecipe.get(row.recipe_id);
    if (bucket) bucket.push(row.item_name);
    else byRecipe.set(row.recipe_id, [row.item_name]);
  }

  return recipes.map((recipe) => {
    const names = byRecipe.get(recipe.id) ?? [];
    return {
      ...recipe,
      have: names.filter((name) => stocked.has(name.toLowerCase())).length,
      total: names.length,
    };
  });
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
  return result.rows as unknown as RecipeWithAuthor[];
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
  return result.rows as unknown as RecipeWithAuthor[];
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
  return result.rows as unknown as Comment[];
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

export interface ExpiringItem extends Item {
  /** The earlier of the packet date and the opened-plus-shelf-life date. */
  use_by: string;
  days_left: number;
  /** True when the deadline comes from having opened it, not the packet. */
  because_opened: number;
}

/**
 * The deadline that actually applies to a jar.
 *
 * A sealed thing is good until the date on it. An open thing is good for
 * however long it keeps once open, counted from when it was opened - and if
 * both apply, whichever comes first wins. Written once here because three
 * places need to agree about it.
 */
const USE_BY = `
  MIN(
    COALESCE(expiry_date, '9999-12-31'),
    COALESCE(
      CASE WHEN opened_at IS NOT NULL AND shelf_life_days IS NOT NULL
        THEN date(opened_at, '+' || shelf_life_days || ' days')
      END,
      '9999-12-31'
    )
  )
`;

/**
 * What's about to go off, soonest first.
 *
 * Anything already past is included with a negative count, because "this went
 * off on Tuesday" is more useful than silence.
 */
export async function getExpiring(
  kitchenId: number | null,
  withinDays = 7,
): Promise<ExpiringItem[]> {
  if (kitchenId === null) return [];

  const result = await getDb().execute({
    sql: `SELECT *, ${USE_BY} AS use_by,
                 CAST(julianday(${USE_BY}) - julianday('now') AS INTEGER) AS days_left,
                 (opened_at IS NOT NULL
                   AND shelf_life_days IS NOT NULL
                   AND date(opened_at, '+' || shelf_life_days || ' days') <=
                       COALESCE(expiry_date, '9999-12-31')) AS because_opened
          FROM items
          WHERE kitchen_id = ?
            -- An unopened pack goes off too, and quantity only counts the open
            -- one, so three sealed tins would otherwise read as nothing there.
            AND (quantity > 0 OR sealed_count > 0)
            AND ${USE_BY} < '9999-12-31'
            AND julianday(${USE_BY}) - julianday('now') <= ?
          ORDER BY use_by`,
    args: [kitchenId, withinDays],
  });
  return result.rows as unknown as ExpiringItem[];
}

export async function getItem(
  kitchenId: number,
  itemId: number,
): Promise<Item | null> {
  const result = await getDb().execute({
    sql: "SELECT * FROM items WHERE id = ? AND kitchen_id = ?",
    args: [itemId, kitchenId],
  });
  return (result.rows[0] as unknown as Item) ?? null;
}

export interface Rescue {
  item: ExpiringItem;
  /** Recipes that use it, the most makeable first. */
  recipes: RecipeWithMatch[];
}

/**
 * What to cook before it goes off.
 *
 * The stock page has always listed what is expiring, which tells you there is a
 * problem without helping with it. This answers the next question: given that
 * the coriander dies on Thursday, what can actually be made with it tonight.
 *
 * Ranked by how much of the rest of the recipe is already here, because a
 * recipe needing five other things you do not have is not a rescue, it is a
 * shopping trip. Ties go to whatever has been cooked most, on the grounds that
 * a recipe you return to is a recipe that works.
 *
 * The deadline is whichever comes first of the date on the packet and
 * `opened_at + shelf_life_days`, which getExpiring already works out - so this
 * is a ranking problem rather than a second definition of "going off", and
 * there is no way for the two to disagree.
 */
export async function getRescues(
  kitchenId: number | null,
  authorId: number,
  withinDays = 7,
): Promise<Rescue[]> {
  if (kitchenId === null) return [];

  const [expiring, recipes, stocked, ingredientRows] = await Promise.all([
    getExpiring(kitchenId, withinDays),
    getMyRecipes(authorId),
    getStockedItemNames(kitchenId),
    getDb().execute("SELECT recipe_id, item_name FROM recipe_ingredients"),
  ]);
  if (expiring.length === 0) return [];

  const names = new Map<number, string[]>();
  for (const row of ingredientRows.rows as unknown as RecipeIngredient[]) {
    const bucket = names.get(row.recipe_id);
    if (bucket) bucket.push(row.item_name);
    else names.set(row.recipe_id, [row.item_name]);
  }

  const scored = recipes.map((recipe) => {
    const lines = names.get(recipe.id) ?? [];
    return {
      recipe,
      lines: lines.map((name) => name.toLowerCase()),
      have: lines.filter((name) => stocked.has(name.toLowerCase())).length,
      total: lines.length,
    };
  });

  return expiring
    .map((item) => {
      const wanted = item.name.toLowerCase();
      const uses = scored
        .filter((entry) => entry.lines.includes(wanted))
        .sort((a, b) => {
          // Proportion rather than count: a recipe with three of four is a
          // better bet than one with four of twelve.
          const readiness = b.have / Math.max(1, b.total) - a.have / Math.max(1, a.total);
          return readiness !== 0 ? readiness : b.recipe.times_cooked - a.recipe.times_cooked;
        })
        .slice(0, 2)
        .map((entry) => ({ ...entry.recipe, have: entry.have, total: entry.total }));

      return { item, recipes: uses };
    })
    // Items nothing can be made from still belong on the list - they are the
    // ones about to be thrown away - so they are kept, not filtered out.
    .sort((a, b) => a.item.days_left - b.item.days_left);
}

export interface CookedEntry {
  id: number;
  recipe_id: number;
  recipe_name: string;
  servings: number;
  cooked_at: string;
  cooked_by_handle: string | null;
  cooked_by_name: string | null;
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
): Promise<CookedEntry[]> {
  if (kitchenId === null) return [];

  const result = await getDb().execute({
    sql: `SELECT c.id, c.recipe_id, r.name AS recipe_name, c.servings, c.cooked_at,
                 u.handle AS cooked_by_handle, u.display_name AS cooked_by_name
          FROM cook_events c
          JOIN recipes r ON r.id = c.recipe_id
          LEFT JOIN users u ON u.id = c.cooked_by
          WHERE c.kitchen_id = ? AND c.undone_at IS NULL
          ORDER BY c.cooked_at DESC, c.id DESC
          LIMIT ?`,
    args: [kitchenId, limit],
  });
  return result.rows as unknown as CookedEntry[];
}

export interface Neglected {
  id: number;
  name: string;
  /** Days since anything touched it. */
  idle_days: number;
  recipes: RecipeWithMatch[];
}

/**
 * Things sitting untouched, and what they are good for.
 *
 * The opposite question to the restock one: not "what have I run out of" but
 * "what did I buy and then never use". `updated_at` moves on every adjustment,
 * cook and edit, so it is a fair proxy for when the jar was last thought about.
 *
 * Only things actually in stock, and only past a month, because a fortnight of
 * quiet is not neglect - it is a cupboard working normally.
 */
export async function getNeglected(
  kitchenId: number | null,
  authorId: number,
  idleDays = 30,
): Promise<Neglected[]> {
  if (kitchenId === null) return [];

  const result = await getDb().execute({
    sql: `SELECT id, name,
                 CAST(julianday('now') - julianday(updated_at) AS INTEGER) AS idle_days
          FROM items
          WHERE kitchen_id = ?
            AND (quantity > 0 OR sealed_count > 0)
            AND updated_at IS NOT NULL
            AND julianday('now') - julianday(updated_at) >= ?
          ORDER BY idle_days DESC
          LIMIT 8`,
    args: [kitchenId, idleDays],
  });

  const idle = result.rows as unknown as Omit<Neglected, "recipes">[];
  if (idle.length === 0) return [];

  const [recipes, stocked, ingredientRows] = await Promise.all([
    getMyRecipes(authorId),
    getStockedItemNames(kitchenId),
    getDb().execute("SELECT recipe_id, item_name FROM recipe_ingredients"),
  ]);

  const names = new Map<number, string[]>();
  for (const row of ingredientRows.rows as unknown as RecipeIngredient[]) {
    const bucket = names.get(row.recipe_id);
    if (bucket) bucket.push(row.item_name);
    else names.set(row.recipe_id, [row.item_name]);
  }

  return idle.map((item) => {
    const wanted = item.name.toLowerCase();
    const uses = recipes
      .map((recipe) => {
        const lines = names.get(recipe.id) ?? [];
        return {
          recipe,
          lines: lines.map((name) => name.toLowerCase()),
          have: lines.filter((name) => stocked.has(name.toLowerCase())).length,
          total: lines.length,
        };
      })
      .filter((entry) => entry.lines.includes(wanted))
      .sort((a, b) => b.have / Math.max(1, b.total) - a.have / Math.max(1, a.total))
      .slice(0, 2)
      .map((entry) => ({ ...entry.recipe, have: entry.have, total: entry.total }));

    return { ...item, recipes: uses };
  });
}
